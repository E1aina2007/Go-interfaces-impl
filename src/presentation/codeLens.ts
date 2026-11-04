import {
	CodeLens,
	EventEmitter,
	Range,
	workspace,
	type CancellationToken,
	type CodeLensProvider,
	type Disposable,
	type LogOutputChannel,
	type TextDocument,
} from 'vscode';
import type { GoSyntax } from '../core/syntax';
import { findImplementations, findInterfaces, findStructs } from './commands';

export class ImplementationLenses implements CodeLensProvider, Disposable {
	private readonly changed = new EventEmitter<void>();
	private readonly configuration: Disposable;
	private disposed = false;
	readonly onDidChangeCodeLenses = this.changed.event;

	constructor(
		private readonly syntax: GoSyntax,
		private readonly output: LogOutputChannel,
	) {
		this.configuration = workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('goInterfaces.codeLens')) {
				this.changed.fire();
			}
		});
	}

	async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (
			this.disposed ||
			token.isCancellationRequested ||
			!workspace.isTrusted ||
			!workspace.getWorkspaceFolder(document.uri) ||
			!workspace.getConfiguration('goInterfaces', document.uri).get<boolean>('codeLens', true)
		) {
			return [];
		}
		const version = document.version;
		try {
			const file = await this.syntax.read(document.getText());
			if (
				this.disposed ||
				token.isCancellationRequested ||
				document.version !== version ||
				file.hasErrors
			) {
				return [];
			}
			const lenses: CodeLens[] = [];
			for (const declaration of file.declarations) {
				if (declaration.generic || declaration.kind === 'unsupported') {
					continue;
				}
				if (
					declaration.kind !== 'reference' &&
					(declaration.constraint || declaration.empty)
				) {
					continue;
				}
				let title = 'Show implementation relations';
				let command = findImplementations;
				if (declaration.kind === 'struct') {
					title = 'Show implemented interfaces';
					command = findInterfaces;
				} else if (declaration.kind === 'interface') {
					title = 'Show implementing structs';
					command = findStructs;
				}
				const position = document.positionAt(declaration.start);
				// Lenses offer actions without launching a module query for every visible declaration.
				// CodeLens 仅提供操作入口，不为每个可见声明自动发起模块查询
				lenses.push(
					new CodeLens(new Range(position, document.positionAt(declaration.end)), {
						title,
						command,
						arguments: [document.uri, position, version],
					}),
				);
			}
			return lenses;
		} catch (error) {
			if (!this.disposed) {
				this.output.error('Unable to read Go declarations for CodeLens', error);
			}
			return [];
		}
	}

	dispose(): void {
		this.disposed = true;
		this.configuration.dispose();
		this.changed.dispose();
	}
}
