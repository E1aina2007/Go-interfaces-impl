import {
	CancellationError,
	CancellationTokenSource,
	EventEmitter,
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
import { StaleQueryError, type QueryResult } from './model';
import type { CapturedFile } from './resolve';
import { runQuery } from './run';

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
		try {
			return await runQuery(
				{
					provider: this.provider,
					token,
					generation,
					read,
					check,
					prepare: async (resource): Promise<void> => {
						// Editor annotations query many declarations per file; check readiness once per generation.
						// 编辑器展示会对同一文件的多个声明查询，每个 generation 只确认一次语言服务就绪
						if (!this.prepared.has(resource.toString())) {
							await this.provider.prepare(resource, token);
							check();
							this.prepared.add(resource.toString());
						}
					},
				},
				uri,
				position,
				expected,
				sourceVersion,
			);
		} catch (error) {
			check();
			throw error;
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
		this.invalidated.dispose();
	}
}
