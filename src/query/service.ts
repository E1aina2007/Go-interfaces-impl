import path from 'node:path';
import {
	CancellationError,
	CancellationTokenSource,
	EventEmitter,
	Location,
	workspace,
	type CancellationToken,
	type Disposable,
	type Position,
	type TextDocument,
	type Uri,
} from 'vscode';
import type { GoSyntax } from '../core/syntax';
import type { TypeKind } from '../core/types';
import { GoProvider } from '../language/provider';
import { belongsToModule, findModule, type GoModule } from '../workspace/module';
import { GoSyntaxError, TypeResolver, type CapturedFile, type LocatedType } from './resolve';
import { TestingFilter } from './filter';

export interface QueryResult {
	readonly coverage: 'provider-limited';
	readonly module: GoModule;
	readonly subject: LocatedType;
	readonly matches: readonly LocatedType[];
	readonly hidden: number;
	readonly unverifiedTesting: ReadonlySet<string>;
	readonly skipped: number;
	readonly unreadable: number;
	readonly hideTesting: boolean;
	readonly generation: number;
}

export class StaleQueryError extends Error {
	constructor() {
		super('Go sources or settings changed. Run the query again.');
	}
}

export class ImplementationQueries implements Disposable {
	private readonly provider = new GoProvider();
	private readonly invalidated = new EventEmitter<void>();
	private readonly subscriptions: Disposable[];
	private readonly pending = new Set<CancellationTokenSource>();
	// Documents whose symbols the Go extension already served in this generation.
	// 当前 generation 内 Go 扩展已经成功返回符号的文档
	private readonly prepared = new Set<string>();
	private generation = 0;
	private disposed = false;
	readonly onDidInvalidate = this.invalidated.event;

	constructor(private readonly syntax: GoSyntax) {
		const dirty = new Set(
			workspace.textDocuments
				.filter((document) => document.isDirty)
				.map((document) => document.uri.toString()),
		);
		const track = (document: TextDocument): void => {
			if (document.isDirty) {
				dirty.add(document.uri.toString());
			} else {
				dirty.delete(document.uri.toString());
			}
		};
		const invalidate = (): void => {
			this.generation++;
			this.prepared.clear();
			// Stop waiting for stale providers; the generation check still reports why the query ended.
			// 停止等待已过期的语言服务请求，仍通过 generation 检查说明查询结束原因
			for (const request of this.pending) {
				request.cancel();
			}
			this.invalidated.fire();
		};
		const watcher = workspace.createFileSystemWatcher('**/*.{go,mod,sum,work}');
		this.subscriptions = [
			watcher,
			watcher.onDidCreate(invalidate),
			watcher.onDidChange(invalidate),
			watcher.onDidDelete(invalidate),
			workspace.onDidOpenTextDocument((document) => {
				track(document);
				if (document.isDirty) {
					invalidate();
				}
			}),
			workspace.onDidChangeTextDocument((event) => {
				track(event.document);
				if (
					event.document.languageId === 'go' ||
					/(?:^|\/)(?:go\.(?:mod|sum|work)|go\.work\.sum)$/.test(event.document.uri.path)
				) {
					invalidate();
				}
			}),
			workspace.onDidCloseTextDocument((document) => {
				// Discarding a dirty buffer changes the source; closing a clean provider-opened file does not.
				// 丢弃未保存缓冲区会改变源码，语言服务打开的干净文档关闭时无需使查询过期
				if (dirty.delete(document.uri.toString())) {
					invalidate();
				}
			}),
			workspace.onDidSaveTextDocument((document) => track(document)),
			workspace.onDidChangeWorkspaceFolders(invalidate),
			workspace.onDidChangeConfiguration((event) => {
				if (
					event.affectsConfiguration('go') ||
					event.affectsConfiguration('gopls') ||
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
		expected: TypeKind | 'auto',
		caller: CancellationToken,
		sourceVersion?: number,
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
		// Check workspace changes and captured document versions before accepting asynchronous results.
		// 接受异步结果前同时核对工作区变化和已捕获文档版本
		const check = (): void => {
			if (this.disposed || caller.isCancellationRequested) {
				throw new CancellationError();
			}
			// Invalidation cancels our wait internally; keep it distinct from the caller's explicit cancellation.
			// 失效会在内部取消等待，仍需与调用方主动取消区分
			if (
				generation !== this.generation ||
				[...captured.values()].some((file) => file.document.version !== file.version)
			) {
				throw new StaleQueryError();
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
		};
		const read = async (resource: Uri): Promise<CapturedFile> => {
			check();
			const previous = captured.get(resource.toString());
			if (previous) {
				return previous;
			}
			const document = await workspace.openTextDocument(resource);
			check();
			const version = document.version;
			const syntax = await this.syntax.read(document.getText());
			const file = { document, version, syntax };
			captured.set(resource.toString(), file);
			check();
			return file;
		};
		const resolver = new TypeResolver(this.provider, read, token);
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
			if (sourceVersion !== undefined && source.document.version !== sourceVersion) {
				throw new StaleQueryError();
			}
			if (source.document.languageId !== 'go') {
				throw new Error('Select a Go source document.');
			}
			position = source.document.getWordRangeAtPosition(position)?.start ?? position;
			const module = await findModule(uri.toString());
			if (!module) {
				throw new Error('No go.mod was found for the selected file.');
			}
			// Editor annotations query many declarations per file; check readiness once per generation.
			// 编辑器展示会对同一文件的多个声明查询，每个 generation 只确认一次语言服务就绪
			if (!this.prepared.has(uri.toString())) {
				await this.provider.prepare(uri, token);
				check();
				this.prepared.add(uri.toString());
			}
			check();
			const subject = await resolver.resolveReference(new Location(uri, position));
			if (!subject) {
				throw new Error(
					'Select a named struct or interface. Its type reference must resolve unambiguously within 32 declarations; pointers and generic instances are not supported.',
				);
			}
			if (expected !== 'auto' && subject.declaration.kind !== expected) {
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
			const seen = new Set<string>();
			let skipped = 0;
			let unreadable = 0;
			const moduleResults = new Map<string, Promise<boolean>>();
			const belongs = (uri: string): Promise<boolean> => {
				let result = moduleResults.get(uri);
				if (!result) {
					result = belongsToModule(uri, module);
					moduleResults.set(uri, result);
				}
				return result;
			};
			for (const location of locations) {
				check();
				if (location.uri.scheme !== 'file') {
					skipped++;
					continue;
				}
				const key = location.uri.toString();
				if (!(await belongs(key))) {
					continue;
				}
				const match = await this.candidate(resolver, location);
				if (match === 'unreadable') {
					unreadable++;
					continue;
				}
				if (!match) {
					skipped++;
					continue;
				}
				// Interface-to-interface results are outside this relation scope, not unsupported failures.
				// 接口之间的结果不属于本插件的关系范围，也不是不支持导致的失败
				if (match.declaration.kind === subject.declaration.kind) {
					continue;
				}
				if (
					match.declaration.generic ||
					match.declaration.constraint ||
					match.declaration.empty
				) {
					skipped++;
					continue;
				}
				// Recheck the canonical type so a local alias cannot import a dependency into module results.
				// 再次核对规范类型，避免通过本地别名把依赖类型加入当前模块结果
				if (!(await belongs(match.location.uri.toString()))) {
					continue;
				}
				const identity = match.id;
				if (seen.has(identity)) {
					continue;
				}
				seen.add(identity);
				matches.set(identity, match);
			}
			const candidates = [...matches.values()];
			// Disabling filtering also skips embedded-interface expansion and method-origin provider calls.
			// 关闭过滤时也跳过嵌入接口展开和方法来源的语言服务调用
			const filtered = hideTesting
				? await new TestingFilter(this.provider, resolver, read, belongs, token).apply(
						subject,
						candidates,
					)
				: { matches: candidates, hidden: 0, unverified: new Set<string>() };
			check();
			return {
				coverage: 'provider-limited',
				module,
				subject,
				matches: [...filtered.matches].sort(
					(a, b) =>
						a.declaration.name.localeCompare(b.declaration.name) ||
						a.location.uri.toString().localeCompare(b.location.uri.toString()),
				),
				hidden: filtered.hidden,
				unverifiedTesting: filtered.unverified,
				skipped,
				unreadable,
				hideTesting,
				generation,
			};
		} catch (error) {
			check();
			throw error;
		} finally {
			cancel.dispose();
			request.dispose();
			this.pending.delete(request);
		}
	}

	private async candidate(
		resolver: TypeResolver,
		location: Location,
	): Promise<LocatedType | 'unreadable' | undefined> {
		try {
			return await resolver.resolve(location);
		} catch (error) {
			// A candidate file being edited must not fail the whole query; it is counted separately.
			// 正在编辑的候选文件不应使整个查询失败，单独计数并在摘要中显示
			if (error instanceof GoSyntaxError) {
				return 'unreadable';
			}
			throw error;
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
		this.invalidated.dispose();
	}
}
