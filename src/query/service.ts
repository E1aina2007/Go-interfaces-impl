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
import { GoProvider } from '../language/provider';
import { StaleQueryError, type CapturedFile, type QueryKind, type QueryResult } from './model';
import { runQuery } from './run';

export class ImplementationQueries implements Disposable {
	private readonly provider = new GoProvider();
	private readonly invalidated = new EventEmitter<void>();
	private readonly subscriptions: Disposable[];
	private readonly pending = new Set<CancellationTokenSource>();
	// Documents prepared for the current query generation.
	// 当前查询 generation 中已准备的文档
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
			// Cancel pending requests when results are invalidated.
			// 查询结果失效时取消在途请求
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
				// Invalidate queries when an edited document closes.
				// 编辑过的文档关闭时使查询失效
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
		expected: QueryKind,
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
		// Validate the query generation and captured document versions.
		// 校验查询 generation 和已捕获的文档版本
		const check = (): void => {
			if (this.disposed || caller.isCancellationRequested) {
				throw new CancellationError();
			}
			// Report invalidation when the generation or a captured version changes.
			// 查询 generation 或已捕获的文档版本变化时报告失效
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
						// Prepare each document once per generation.
						// 每个 generation 中每篇文档只准备一次
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
