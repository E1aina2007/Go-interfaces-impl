import type { Node } from '@vscode/tree-sitter-wasm';
import type { GoDeclaration, GoMethod, TypeKind } from './types';

export function importsTesting(literal: Node): boolean {
	const text = literal.text;
	if (literal.type === 'raw_string_literal') {
		return text.slice(1, -1).replaceAll('\r', '') === 'testing';
	}
	// Decode numeric escapes only for this exact ASCII import; all other escapes rule out "testing".
	// 仅为精确的 ASCII 导入路径解码数字转义，其他转义均不可能组成 testing
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

// Named embedded types need semantic resolution; reject only constraints visible in the syntax.
// 命名嵌入类型需要语义解析，因此这里只拒绝语法可直接识别的约束
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
	return {
		name: name.text,
		start: name.startIndex,
		end: name.endIndex,
		receiver: type.startIndex,
		generic: type.type === 'generic_type',
	};
}

// A named field's inner embeddings do not promote methods to the outer struct.
// 具名字段内部的嵌入不会向外层结构体提升方法
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
	// Pointers and composite types do not become structs merely because they mention a struct name.
	// 指针和其他复合类型不会因为引用了 struct 名称就成为 struct
	if (type.type !== 'struct_type' && type.type !== 'interface_type') {
		return { ...base, kind: 'unsupported' };
	}
	const kind: TypeKind = type.type === 'struct_type' ? 'struct' : 'interface';
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
