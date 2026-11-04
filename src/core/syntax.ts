import path from 'node:path';
import { Language, Parser, type Node } from '@vscode/tree-sitter-wasm';
import type { GoDeclaration, GoFile, TypeKind } from './types';

function importsTesting(literal: Node): boolean {
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

function declaration(node: Node): GoDeclaration | undefined {
	const name = node.childForFieldName('name');
	const type = node.childForFieldName('type');
	if (!name || !type || (type.type !== 'struct_type' && type.type !== 'interface_type')) {
		return undefined;
	}
	const kind: TypeKind = type.type === 'struct_type' ? 'struct' : 'interface';
	const elements = type.namedChildren.filter(
		(child): child is Node => child !== null && child.type !== 'comment',
	);
	return {
		name: name.text,
		kind,
		start: name.startIndex,
		end: name.endIndex,
		generic: node.childForFieldName('type_parameters') !== null,
		empty: kind === 'interface' && elements.length === 0,
		constraint:
			kind === 'interface' &&
			type.namedChildren.some((element) => {
				if (element?.type !== 'type_elem') {
					return false;
				}
				const members = element.namedChildren.filter((child) => child?.type !== 'comment');
				return (
					members.length > 1 ||
					members.some(
						(member) =>
							member !== null &&
							(member.type === 'negated_type' ||
								/^(bool|byte|complex64|complex128|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr)$/.test(
									member.text,
								)),
					)
				);
			}),
	};
}

export class GoSyntax {
	private parser: Parser | undefined;
	private loading: Promise<void> | undefined;
	private disposed = false;

	constructor(private readonly assetsPath: string) {}

	async read(text: string): Promise<GoFile> {
		this.loading ??= this.initialize();
		await this.loading;
		if (this.disposed || !this.parser) {
			throw new Error('Go syntax parser is closed.');
		}
		const tree = this.parser.parse(text);
		if (!tree) {
			throw new Error('Unable to parse the Go document.');
		}
		try {
			const declarations: GoDeclaration[] = [];
			for (const node of tree.rootNode.descendantsOfType(['type_spec', 'type_alias'])) {
				if (!node) {
					continue;
				}
				const item = declaration(node);
				if (item) {
					declarations.push(item);
				}
			}
			const testing = tree.rootNode.descendantsOfType('import_spec').some((node) => {
				const literal = node?.childForFieldName('path');
				return literal !== null && literal !== undefined && importsTesting(literal);
			});
			return { declarations, importsTesting: testing, hasErrors: tree.rootNode.hasError };
		} finally {
			// Keep plain offsets instead of retaining WASM nodes after their owning tree is released.
			// 仅保留普通偏移量，在所属语法树释放后不再持有 WASM 节点
			tree.delete();
		}
	}

	dispose(): void {
		this.disposed = true;
		this.parser?.delete();
		this.parser = undefined;
	}

	private async initialize(): Promise<void> {
		await Parser.init({ locateFile: (filename) => path.join(this.assetsPath, filename) });
		const language = await Language.load(path.join(this.assetsPath, 'tree-sitter-go.wasm'));
		if (!this.disposed) {
			this.parser = new Parser();
			this.parser.setLanguage(language);
		}
	}
}
