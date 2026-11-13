import path from 'node:path';
import { l10n } from 'vscode';
import { Language, Parser, type Node } from '@vscode/tree-sitter-wasm';
import type {
	GoDeclaration,
	GoFile,
	GoInterfaceEmbedding,
	GoInterfaceMethod,
	GoMethod,
} from './types';
import { declaration, importsTesting, method, unparenthesized } from './syntaxDeclarations';

export class GoSyntax {
	private parser: Parser | undefined;
	private loading: Promise<void> | undefined;
	private disposed = false;

	constructor(private readonly assetsPath: string) {}

	async read(text: string): Promise<GoFile> {
		this.loading ??= this.initialize();
		await this.loading;
		if (this.disposed || !this.parser) {
			throw new Error(l10n.t('Go syntax parser is closed.'));
		}
		const tree = this.parser.parse(text);
		if (!tree) {
			throw new Error(l10n.t('Unable to parse the Go document.'));
		}
		try {
			const declarations: GoDeclaration[] = [];
			const interfaceMethods: GoInterfaceMethod[] = [];
			const interfaceEmbeddings: GoInterfaceEmbedding[] = [];
			for (const node of tree.rootNode.descendantsOfType(['type_spec', 'type_alias'])) {
				if (!node) {
					continue;
				}
				const item = declaration(node);
				if (item) {
					declarations.push(item);
				}
				if (item?.kind === 'interface') {
					const type = unparenthesized(node.childForFieldName('type'));
					// Read the interface's direct members.
					// 读取接口的直接成员
					for (const member of type?.namedChildren ?? []) {
						if (member?.type === 'type_elem') {
							const terms = member.namedChildren.filter(
								(term): term is Node => term !== null && term.type !== 'comment',
							);
							const reference =
								terms.length === 1 ? unparenthesized(terms[0]) : undefined;
							let target: number | null = null;
							if (
								reference?.type === 'type_identifier' ||
								reference?.type === 'qualified_type'
							) {
								target =
									reference.childForFieldName('name')?.startIndex ??
									reference.startIndex;
							}
							// Record each type element and its target position when available.
							// 记录每个类型元素及可用的目标位置
							interfaceEmbeddings.push({ owner: item.start, target });
						}
						const name =
							member?.type === 'method_elem'
								? member.childForFieldName('name')
								: null;
						if (name) {
							interfaceMethods.push({
								name: name.text,
								start: name.startIndex,
								end: name.endIndex,
								owner: item.start,
							});
						}
					}
				}
			}
			const methods: GoMethod[] = [];
			for (const node of tree.rootNode.descendantsOfType('method_declaration')) {
				const item = node ? method(node) : undefined;
				if (item) {
					methods.push(item);
				}
			}
			const testing = tree.rootNode.descendantsOfType('import_spec').some((node) => {
				const literal = node?.childForFieldName('path');
				return literal !== null && literal !== undefined && importsTesting(literal);
			});
			return {
				declarations,
				interfaceMethods,
				interfaceEmbeddings,
				methods,
				importsTesting: testing,
				hasErrors: tree.rootNode.hasError,
			};
		} finally {
			// Store offsets before releasing the syntax tree.
			// 释放语法树前保存偏移量
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
