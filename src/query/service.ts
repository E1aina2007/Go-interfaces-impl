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
import { isGoConfigFile } from '../workspace/module';
import { StaleQueryError, type CapturedFile, type QueryOptions, type QueryResult } from './model';
import { runQuery } from './run';

function affectsQueries(document: TextDocument): boolean {
	return document.languageId === 'go' || isGoConfigFile(document.fileName);
}

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
			workspace.textDocuments.filter(
				(document) => document.isDirty && affectsQueries(document),
			),
		);
		const track = (document: TextDocument): boolean => {
			const wasDirty = dirty.has(document);
			const isDirty = document.isDirty && affectsQueries(document);
			if (isDirty) {
				dirty.add(document);
			} else {
				dirty.delete(document);
			}
			return wasDirty !== isDirty;
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
		const watchers = [
			'**/{*.go,go.mod,go.sum,go.work,go.work.sum}',
			'**/vendor/modules.txt',
		].flatMap((pattern): Disposable[] => {
			const watcher = workspace.createFileSystemWatcher(pattern);
			return [
				watcher,
				watcher.onDidCreate(invalidate),
				watcher.onDidChange(invalidate),
				watcher.onDidDelete(invalidate),
			];
		});
		this.subscriptions = [
			...watchers,
			workspace.onDidOpenTextDocument((document) => {
				if (track(document)) {
					invalidate();
				}
			}),
			workspace.onDidChangeTextDocument((event) => {
				const { document, contentChanges } = event;
				const dirtyChanged = track(document);
				// Unsaved Go configuration blocks queries even if only the dirty state changed.
				// 即使仅有未保存状态变化，未保存的 Go 配置也会阻止查询
				if (
					(contentChanges.length > 0 && affectsQueries(document)) ||
					(dirtyChanged && isGoConfigFile(document.fileName))
				) {
					invalidate();
				}
			}),
			workspace.onDidCloseTextDocument((document) => {
				// Invalidate queries when an edited document closes.
				// 编辑过的文档关闭时使查询失效
				if (dirty.delete(document)) {
					invalidate();
				}
			}),
			workspace.onDidSaveTextDocument((document) => {
				if (track(document) && isGoConfigFile(document.fileName)) {
					invalidate();
				}
			}),
			workspace.onDidChangeWorkspaceFolders(invalidate),
			workspace.onDidChangeConfiguration((event) => {
				if (
					event.affectsConfiguration('go') ||
					event.affectsConfiguration('gopls') ||
					event.affectsConfiguration('goInterfaces.hideTestingImplementations')
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
		options: QueryOptions,
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
				options,
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
