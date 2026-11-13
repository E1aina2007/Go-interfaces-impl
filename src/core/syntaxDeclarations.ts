import type { Node } from '@vscode/tree-sitter-wasm';
import type { GoDeclaration, GoMethod, TypeKind } from './types';

export function importsTesting(literal: Node): boolean {
	const text = literal.text;
	if (literal.type === 'raw_string_literal') {
		return text.slice(1, -1).replaceAll('\r', '') === 'testing';
	}
	// Decode the import path before checking for testing.
	// 检查 testing 导入前先解码路径
	const decoded = text
		.slice(1, -1)
		.replace(
			/\\(?:x[\da-fA-F]{2}|u[\da-fA-F]{4}|U[\da-fA-F]{8}|[0-7]{3}|[\s\S])/g,
			(escape: string) => {
				const octal = /^\\[0-7]{3}$/.test(escape);
				const code = Number.parseInt(escape.slice(octal ? 1 : 2), octal ? 8 : 16);
				return code >= 0 && code < 128 ? String.fromCharCode(code) : '\0';
			},
		);
	return decoded === 'testing';
}

// Detect constraints recognized from the syntax tree.
// 检测语法树中可识别的约束接口
function isConstraint(type: Node): boolean {
	for (const element of type.namedChildren) {
		if (element?.type !== 'type_elem') {
			continue;
		}
		const members = element.namedChildren.filter(
			(child): child is Node => child !== null && child.type !== 'comment',
		);
		if (members.length > 1) {
			return true;
		}
		for (const member of members) {
			const term = unparenthesized(member);
			if (
				!term ||
				!['type_identifier', 'qualified_type', 'generic_type'].includes(term.type)
			) {
				return true;
			}
			if (
				/^(bool|byte|comparable|complex64|complex128|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr)$/.test(
					term.text,
				)
			) {
				return true;
			}
		}
	}
	return false;
}

export function unparenthesized(node: Node | null | undefined): Node | undefined {
	let current: Node | undefined = node ?? undefined;
	while (current?.type === 'parenthesized_type') {
		current = current.namedChildren.find(
			(item): item is Node => item !== null && item.type !== 'comment',
		);
	}
	return current;
}

export function method(node: Node): GoMethod | undefined {
	const name = node.childForFieldName('name');
	const receiver = node
		.childForFieldName('receiver')
		?.namedChildren.find((item) => item?.type === 'parameter_declaration');
	let type = unparenthesized(receiver?.childForFieldName('type'));
	if (type?.type === 'pointer_type') {
		type = unparenthesized(
			type.namedChildren.find((item) => item !== null && item.type !== 'comment'),
		);
	}
	if (!name || !type || !['type_identifier', 'generic_type'].includes(type.type)) {
		return undefined;
	}
	const generic = type.type === 'generic_type';
	const receiverTypeParameters = generic ? receiverParameters(type) : [];
	// Receiver parameters introduce their own names, independently of the type declaration.
	// 接收者类型参数有独立名称，不沿用类型声明中的名称
	return {
		name: name.text,
		start: name.startIndex,
		end: name.endIndex,
		receiver: type.startIndex,
		generic,
		receiverTypeParameters,
		signatureUsesTypeParameters: signatureUsesParameters(node, receiverTypeParameters),
	};
}

function signatureUsesParameters(
	node: Node,
	names: readonly string[] | undefined,
): boolean | undefined {
	const parameters = node.childForFieldName('parameters');
	if (!names || !parameters || node.hasError) return undefined;
	for (const part of [parameters, node.childForFieldName('result')]) {
		if (!part) continue;
		for (const item of [part, ...part.descendantsOfType('type_identifier')]) {
			if (item?.type === 'type_identifier' && names.includes(item.text)) return true;
		}
	}
	return false;
}

function receiverParameters(type: Node): string[] | undefined {
	const argumentsNode = type.childForFieldName('type_arguments');
	if (!argumentsNode || argumentsNode.hasError) {
		return undefined;
	}
	const names: string[] = [];
	for (const argument of argumentsNode.namedChildren) {
		if (!argument || argument.type === 'comment') continue;
		const members = argument.namedChildren.filter((item) => item?.type !== 'comment');
		if (members.length !== 1 || members[0]?.type !== 'type_identifier') return undefined;
		names.push(members[0].text);
	}
	return names.length > 0 ? names : undefined;
}

// Detect embedded fields or interface elements.
// 检测嵌入字段或接口元素
function hasEmbedding(type: Node): boolean {
	if (type.type === 'interface_type') {
		return type.namedChildren.some((member) => member?.type === 'type_elem');
	}
	const fields = type.namedChildren.find((member) => member?.type === 'field_declaration_list');
	for (const field of fields?.namedChildren ?? []) {
		if (field?.type === 'field_declaration' && !field.childForFieldName('name')) {
			return true;
		}
	}
	return false;
}

export function declaration(node: Node): GoDeclaration | undefined {
	const name = node.childForFieldName('name');
	const type = unparenthesized(node.childForFieldName('type'));
	if (!name || !type) {
		return undefined;
	}
	const base = {
		name: name.text,
		start: name.startIndex,
		end: name.endIndex,
		generic: node.childForFieldName('type_parameters') !== null || type.type === 'generic_type',
		alias: node.type === 'type_alias',
	};
	if (type.type === 'type_identifier' || type.type === 'qualified_type') {
		return {
			...base,
			kind: 'reference',
			target: type.childForFieldName('name')?.startIndex ?? type.startIndex,
		};
	}
	// Classify supported underlying type forms.
	// 分类支持的底层类型形式
	const kinds: Readonly<Record<string, TypeKind>> = {
		struct_type: 'struct',
		interface_type: 'interface',
		function_type: 'function',
		array_type: 'array',
		slice_type: 'slice',
		map_type: 'map',
		channel_type: 'channel',
	};
	const kind = kinds[type.type];
	if (!kind || (base.alias && kind !== 'struct' && kind !== 'interface')) {
		return { ...base, kind: 'unsupported' };
	}
	const elements = type.namedChildren.filter(
		(child): child is Node => child !== null && child.type !== 'comment',
	);
	return {
		...base,
		kind,
		empty: kind === 'interface' && elements.length === 0,
		constraint: kind === 'interface' && isConstraint(type),
		embedded: hasEmbedding(type),
	};
}
