import path from 'node:path';
import {
	CancellationError,
	CancellationTokenSource,
	Location,
	Range,
	workspace,
	type CancellationToken,
	type Disposable,
	type Position,
	type TextDocument,
	type Uri,
} from 'vscode';
import type { GoSyntax } from '../core/syntax';
import type { GoDeclaration, GoFile, TypeKind } from '../core/types';
import { GoProvider } from '../language/provider';
import { belongsToModule, findModule, type GoModule } from '../workspace/module';

export interface LocatedType {
	readonly declaration: GoDeclaration;
	readonly location: Location;
	readonly testing: boolean;
}

export interface QueryResult {
	readonly coverage: 'provider-limited';
	readonly module: GoModule;
	readonly subject: LocatedType;
	readonly matches: readonly LocatedType[];
	readonly hidden: number;
	readonly skipped: number;
	readonly hideTesting: boolean;
	readonly generation: number;
}

interface CapturedFile {
	readonly document: TextDocument;
	readonly version: number;
	readonly syntax: GoFile;
}

export class StaleQueryError extends Error {
	constructor() {
		super('Go sources or settings changed. Run the query again.');
	}
}

export class ImplementationQueries implements Disposable {
	private readonly provider = new GoProvider();
	private readonly subscriptions: Disposable[];
	private readonly pending = new Set<CancellationTokenSource>();
	private generation = 0;
	private disposed = false;

	constructor(private readonly syntax: GoSyntax) {
		const invalidate = (): void => {
			this.generation++;
		};
		const watcher = workspace.createFileSystemWatcher('**/*.{go,mod,sum,work}');
		this.subscriptions = [
			watcher,
			watcher.onDidCreate(invalidate),
			watcher.onDidChange(invalidate),
			watcher.onDidDelete(invalidate),
			workspace.onDidChangeTextDocument((event) => {
				if (
					event.document.languageId === 'go' ||
					/(?:^|\/)(?:go\.(?:mod|sum|work)|go\.work\.sum)$/.test(event.document.uri.path)
				) {
					invalidate();
				}
			}),
			workspace.onDidCloseTextDocument((document) => {
				if (document.isDirty) {
					invalidate();
				}
			}),
			workspace.onDidChangeWorkspaceFolders(invalidate),
			workspace.onDidChangeConfiguration((event) => {
				if (
					event.affectsConfiguration('go') ||
					event.affectsConfiguration('goInterfaces')
				) {
					invalidate();
				}
			}),
		];
	}

	isCurrent(result: QueryResult): boolean {
		return !this.disposed && this.generation === result.generation;
	}

	async query(
		uri: Uri,
		position: Position,
		expected: TypeKind,
		caller: CancellationToken,
	): Promise<QueryResult> {
		const request = new CancellationTokenSource();
		this.pending.add(request);
		const cancel = caller.onCancellationRequested(() => request.cancel());
		if (caller.isCancellationRequested) {
			request.cancel();
		}
		const token = request.token;
		const generation = this.generation;
		const captured = new Map<string, CapturedFile>();
		const check = (): void => {
			if (this.disposed || token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (
				generation !== this.generation ||
				[...captured.values()].some((file) => file.document.version !== file.version)
			) {
				throw new StaleQueryError();
			}
		};
		const read = async (resource: Uri): Promise<CapturedFile> => {
			check();
			const previous = captured.get(resource.toString());
			if (previous) {
				return previous;
			}
			const document = await workspace.openTextDocument(resource);
			const version = document.version;
			const syntax = await this.syntax.read(document.getText());
			const file = { document, version, syntax };
			captured.set(resource.toString(), file);
			check();
			return file;
		};
		const locate = async (location: Location): Promise<LocatedType | undefined> => {
			if (location.uri.scheme !== 'file' || !location.uri.path.endsWith('.go')) {
				return undefined;
			}
			const file = await read(location.uri);
			if (file.syntax.hasErrors) {
				throw new Error(`Fix Go syntax errors in ${location.uri.fsPath} before querying.`);
			}
			const offset = file.document.offsetAt(location.range.start);
			const declaration = file.syntax.declarations.find(
				(item) => item.start <= offset && offset < item.end,
			);
			if (!declaration) {
				return undefined;
			}
			return {
				declaration,
				location: new Location(
					location.uri,
					new Range(
						file.document.positionAt(declaration.start),
						file.document.positionAt(declaration.end),
					),
				),
				testing: location.uri.path.endsWith('_test.go') && file.syntax.importsTesting,
			};
		};
		try {
			check();
			if (!workspace.isTrusted) {
				throw new Error('Go implementation queries require a trusted workspace.');
			}
			if (uri.scheme !== 'file' || !workspace.getWorkspaceFolder(uri)) {
				throw new Error('Select a Go file inside an open filesystem workspace.');
			}
			if (
				workspace.textDocuments.some(
					(document) =>
						document.isDirty &&
						/^go\.(mod|sum|work|work\.sum)$/.test(path.basename(document.fileName)),
				)
			) {
				throw new Error(
					'Save Go module and workspace configuration files before querying.',
				);
			}
			const source = await read(uri);
			if (source.document.languageId !== 'go') {
				throw new Error('Select a Go source document.');
			}
			position = source.document.getWordRangeAtPosition(position)?.start ?? position;
			const module = await findModule(uri.toString());
			if (!module) {
				throw new Error('No go.mod was found for the selected file.');
			}
			await this.provider.prepare(uri, token);
			check();
			let subject = await locate(new Location(uri, position));
			if (!subject) {
				for (const location of await this.provider.definitions(uri, position, token)) {
					subject = await locate(location);
					if (subject) {
						break;
					}
				}
			}
			if (!subject) {
				throw new Error(
					'Select the name of a type declared directly as struct or interface. Referenced aliases are not supported yet.',
				);
			}
			if (subject.declaration.kind !== expected) {
				throw new Error(`This command requires a ${expected} type.`);
			}
			if (
				subject.declaration.generic ||
				subject.declaration.constraint ||
				subject.declaration.empty
			) {
				throw new Error(
					'Generic declarations, constraint interfaces and empty interfaces are not supported by this query path.',
				);
			}
			// Query from the original reference so the Go extension retains the caller's build context.
			// 从原始引用位置查询，保留 Go 扩展为调用方选择的构建上下文
			const locations = await this.provider.implementations(uri, position, token);
			const hideTesting = workspace
				.getConfiguration('goInterfaces', uri)
				.get<boolean>('hideTestingImplementations', true);
			const matches = new Map<string, LocatedType>();
			let hidden = 0;
			let skipped = 0;
			const moduleResults = new Map<string, Promise<boolean>>();
			for (const location of locations) {
				check();
				if (location.uri.scheme !== 'file') {
					skipped++;
					continue;
				}
				const key = location.uri.toString();
				let belongs = moduleResults.get(key);
				if (!belongs) {
					belongs = belongsToModule(key, module);
					moduleResults.set(key, belongs);
				}
				if (!(await belongs)) {
					continue;
				}
				const match = await locate(location);
				if (
					!match ||
					match.declaration.kind === expected ||
					match.declaration.generic ||
					match.declaration.constraint ||
					match.declaration.empty
				) {
					skipped++;
					continue;
				}
				if (hideTesting && (subject.testing || match.testing)) {
					hidden++;
					continue;
				}
				matches.set(`${key}:${match.declaration.start}`, match);
			}
			check();
			return {
				coverage: 'provider-limited',
				module,
				subject,
				matches: [...matches.values()].sort(
					(a, b) =>
						a.declaration.name.localeCompare(b.declaration.name) ||
						a.location.uri.toString().localeCompare(b.location.uri.toString()),
				),
				hidden,
				skipped,
				hideTesting,
				generation,
			};
		} finally {
			cancel.dispose();
			request.dispose();
			this.pending.delete(request);
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const request of this.pending) {
			request.cancel();
		}
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
	}
}
