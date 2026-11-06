import {
	CancellationError,
	CancellationTokenSource,
	EventEmitter,
	Range,
	commands,
	window,
	workspace,
	type Disposable,
	type LogOutputChannel,
	type TextDocument,
} from 'vscode';
import type { GoSyntax } from '../core/syntax';
import { StaleQueryError, type ImplementationQueries, type QueryResult } from '../query/service';
import { findModule } from '../workspace/module';
import { relationDirection, relationSummary } from './labels';

export const openRelation = 'goInterfaces.openRelation';
export const showRelations = 'goInterfaces.showRelations';
export const retryRelation = 'goInterfaces.retryRelation';
export const inlineLimit = 6;
const refreshDelay = 400;

export interface Annotation {
	// Declaration name plus its occurrence, stable across edits that only move offsets.
	// 声明名称加出现序号，在仅移动偏移的编辑前后保持稳定
	readonly key: string;
	readonly start: number;
	readonly range: Range;
	result?: QueryResult;
	error?: string;
	// Display-only result from before the latest change; never used for navigation.
	// 最近一次变化前的结果，仅用于展示，不用于导航
	previous?: QueryResult | undefined;
}

export interface DocumentAnnotations {
	readonly document: TextDocument;
	readonly version: number;
	readonly items: readonly Annotation[];
	// Syntax errors block new queries; previous results stay visible until the file parses again.
	// 语法错误时不发起新查询，旧结果保持展示直到文件重新可解析
	readonly blocked: boolean;
}

export interface ShownResult {
	readonly result: QueryResult;
	readonly stale: boolean;
}

interface PendingAnnotation {
	readonly state: DocumentAnnotations;
	readonly item: Annotation;
	readonly request: CancellationTokenSource;
}

export function shownResult(item: Annotation): ShownResult | undefined {
	if (item.result) {
		return { result: item.result, stale: false };
	}
	if (item.previous && !item.error) {
		return { result: item.previous, stale: true };
	}
	return undefined;
}

export function annotationsEnabled(
	document: TextDocument,
	setting: 'codeLens' | 'gutterIcons',
): boolean {
	return (
		workspace.isTrusted &&
		document.languageId === 'go' &&
		document.uri.scheme === 'file' &&
		!document.isClosed &&
		workspace.getWorkspaceFolder(document.uri) !== undefined &&
		workspace.getConfiguration('goInterfaces', document.uri).get<boolean>(setting, true) &&
		(setting !== 'codeLens' ||
			workspace.getConfiguration('editor', document.uri).get<boolean>('codeLens', true))
	);
}

export function relationArguments(
	state: DocumentAnnotations,
	item: Annotation,
	result: QueryResult,
): unknown[] {
	return [state.document.uri.toString(), state.version, item.start, result.generation];
}

export class ImplementationAnnotations implements Disposable {
	private readonly changed = new EventEmitter<void>();
	private readonly subscriptions: Disposable[];
	private readonly documents = new Map<string, DocumentAnnotations>();
	// Results kept per document URI and declaration key while the next query runs.
	// 按文档 URI 和声明键保存的结果，在下一次查询完成前继续展示
	private readonly previous = new Map<string, Map<string, QueryResult>>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private active: PendingAnnotation | undefined;
	private running = false;
	private refreshAgain = false;
	private revision = 0;
	private disposed = false;
	readonly onDidChange = this.changed.event;

	constructor(
		private readonly syntax: GoSyntax,
		private readonly queries: ImplementationQueries,
		private readonly output: LogOutputChannel,
	) {
		this.subscriptions = [
			queries.onDidInvalidate(() => {
				this.revision++;
				this.active?.request.cancel();
				this.retain();
				this.documents.clear();
				this.changed.fire();
				this.schedule();
			}),
			window.onDidChangeVisibleTextEditors(() => {
				for (const [key, state] of this.documents) {
					if (
						!window.visibleTextEditors.some(
							(editor) => editor.document === state.document,
						)
					) {
						this.documents.delete(key);
					}
				}
				for (const key of this.previous.keys()) {
					if (
						!window.visibleTextEditors.some(
							(editor) => editor.document.uri.toString() === key,
						)
					) {
						this.previous.delete(key);
					}
				}
				this.visibleChanged();
				this.changed.fire();
			}),
			window.onDidChangeTextEditorVisibleRanges(() => this.visibleChanged()),
			workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('editor.codeLens')) {
					this.visibleChanged();
					this.changed.fire();
				}
			}),
			commands.registerCommand(
				openRelation,
				(
					source: string,
					version: number,
					offset: number,
					generation: number,
					target: string,
				): Promise<void> => this.navigate(source, version, offset, generation, target),
			),
			commands.registerCommand(
				showRelations,
				(
					source: string,
					version: number,
					offset: number,
					generation: number,
				): Promise<void> => this.showAll(source, version, offset, generation),
			),
			commands.registerCommand(
				retryRelation,
				(source: string, version: number, offset: number): void => {
					const state = this.documents.get(source);
					const item = state?.items.find((item) => item.start === offset);
					if (state?.version === version && state.document.version === version && item) {
						delete item.error;
						this.changed.fire();
						this.schedule();
					}
				},
			),
		];
		this.schedule();
	}

	get(document: TextDocument): DocumentAnnotations | undefined {
		const state = this.documents.get(document.uri.toString());
		return state?.document === document && state.version === document.version
			? state
			: undefined;
	}

	// True while retained results wait for the document to be read again after a change.
	// 变化后文档尚未重新读取、旧结果仍在等待接续时返回 true
	retaining(document: TextDocument): boolean {
		return this.previous.has(document.uri.toString());
	}

	async load(document: TextDocument): Promise<DocumentAnnotations | undefined> {
		if (
			this.disposed ||
			(!annotationsEnabled(document, 'codeLens') &&
				!annotationsEnabled(document, 'gutterIcons'))
		) {
			this.drop(document);
			return undefined;
		}
		const previous = this.get(document);
		if (previous) {
			return previous;
		}
		const version = document.version;
		const revision = this.revision;
		try {
			if (!(await findModule(document.uri.toString()))) {
				this.drop(document);
				return undefined;
			}
			const file = await this.syntax.read(document.getText());
			if (
				this.disposed ||
				document.isClosed ||
				document.version !== version ||
				revision !== this.revision
			) {
				return undefined;
			}
			const uri = document.uri.toString();
			const retained = this.previous.get(uri);
			const occurrences = new Map<string, number>();
			const items: Annotation[] = [];
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
				const occurrence = occurrences.get(declaration.name) ?? 0;
				occurrences.set(declaration.name, occurrence + 1);
				const key = `${declaration.name}#${occurrence}`;
				items.push({
					key,
					start: declaration.start,
					range: new Range(
						document.positionAt(declaration.start),
						document.positionAt(declaration.end),
					),
					previous: retained?.get(key),
				});
			}
			// Concurrent CodeLens and editor callbacks must share the same result storage.
			// CodeLens 与编辑器回调并行到达时，必须共用同一份结果存储
			const existing = this.get(document);
			if (existing) {
				return existing;
			}
			const state = { document, version, items, blocked: file.hasErrors };
			this.documents.set(uri, state);
			this.previous.delete(uri);
			if (retained) {
				this.changed.fire();
			}
			this.schedule();
			return state;
		} catch (error) {
			if (!this.disposed) {
				this.output.error('Unable to read Go declarations for editor annotations', error);
				this.drop(document);
			}
			return undefined;
		}
	}

	// Discard retained results that can no longer be attached, so old icons do not linger.
	// 丢弃无法再接续的旧结果，避免旧图标一直残留
	private drop(document: TextDocument): void {
		if (this.previous.delete(document.uri.toString()) && !this.disposed) {
			this.changed.fire();
		}
	}

	private visibleChanged(): void {
		if (this.active && !this.visible(this.active.state, this.active.item)) {
			this.active.request.cancel();
		}
		this.schedule();
	}

	// Carry displayed results across invalidation so names and icons do not flicker while typing.
	// 失效时保留已展示的结果，避免输入过程中名称和图标反复闪烁
	private retain(): void {
		for (const [uri, state] of this.documents) {
			const results = new Map<string, QueryResult>();
			for (const item of state.items) {
				const shown = shownResult(item);
				if (shown) {
					results.set(item.key, shown.result);
				}
			}
			this.previous.set(uri, results);
		}
	}

	private schedule(): void {
		if (this.disposed) {
			return;
		}
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.refresh();
		}, refreshDelay);
	}

	private visible(state: DocumentAnnotations, item: Annotation): boolean {
		return (
			this.get(state.document) === state &&
			(annotationsEnabled(state.document, 'codeLens') ||
				annotationsEnabled(state.document, 'gutterIcons')) &&
			window.visibleTextEditors.some(
				(editor) =>
					editor.document === state.document &&
					editor.visibleRanges.some((range) => range.contains(item.range.start)),
			)
		);
	}

	private async refresh(): Promise<void> {
		if (this.disposed) {
			return;
		}
		if (this.running) {
			this.refreshAgain = true;
			return;
		}
		this.running = true;
		try {
			for (const editor of window.visibleTextEditors) {
				await this.load(editor.document);
			}
			// Debounce editor events and serialize queries for visible declarations, never the whole module.
			// 合并编辑器事件并串行查询可见声明，不预先扫描整个模块
			for (const state of this.documents.values()) {
				for (const item of state.items) {
					if (
						this.disposed ||
						state.blocked ||
						item.result ||
						item.error ||
						!this.visible(state, item)
					) {
						continue;
					}
					const request = new CancellationTokenSource();
					this.active = { state, item, request };
					try {
						const result = await this.queries.query(
							state.document.uri,
							item.range.start,
							'auto',
							request.token,
							state.version,
						);
						if (
							!request.token.isCancellationRequested &&
							this.visible(state, item) &&
							this.queries.isCurrent(result)
						) {
							item.result = result;
							delete item.previous;
						}
					} catch (error) {
						if (
							this.disposed ||
							request.token.isCancellationRequested ||
							error instanceof CancellationError ||
							error instanceof StaleQueryError
						) {
							return;
						}
						item.error = error instanceof Error ? error.message : String(error);
						delete item.previous;
						this.output.error(
							'Unable to query Go editor implementation annotations',
							error,
						);
					} finally {
						this.active = undefined;
						request.dispose();
					}
					if (!this.disposed) {
						this.changed.fire();
					}
				}
			}
		} finally {
			this.running = false;
			if (this.refreshAgain) {
				this.refreshAgain = false;
				this.schedule();
			}
		}
	}

	private current(
		source: string,
		version: number,
		offset: number,
		generation: number,
	): QueryResult {
		const state = this.documents.get(source);
		const result = state?.items.find((item) => item.start === offset)?.result;
		if (
			!state ||
			state.document.isClosed ||
			state.version !== version ||
			state.document.version !== version ||
			!result ||
			result.generation !== generation ||
			!this.queries.isCurrent(result)
		) {
			throw new StaleQueryError();
		}
		return result;
	}

	private async navigate(
		source: string,
		version: number,
		offset: number,
		generation: number,
		target: string,
	): Promise<void> {
		try {
			const result = this.current(source, version, offset, generation);
			const match = result.matches.find((item) => item.id === target);
			if (!match) {
				throw new StaleQueryError();
			}
			const document = await workspace.openTextDocument(match.location.uri);
			if (this.disposed || !this.queries.isCurrent(result)) {
				throw new StaleQueryError();
			}
			await window.showTextDocument(document, {
				selection: match.location.range,
				preview: true,
			});
		} catch (error) {
			this.report(error);
		}
	}

	private async showAll(
		source: string,
		version: number,
		offset: number,
		generation: number,
	): Promise<void> {
		try {
			const result = this.current(source, version, offset, generation);
			const selected = await window.showQuickPick(
				result.matches.map((match) => ({
					label: match.declaration.name,
					description: workspace.asRelativePath(match.location.uri),
					detail: `${match.location.uri.fsPath}:${match.location.range.start.line + 1}${result.unverifiedTesting.has(match.id) ? ' · Test sources unverified' : ''}`,
					match,
				})),
				{
					title: `${result.subject.declaration.name} · ${relationDirection(result)}`,
					placeHolder: relationSummary(result),
					matchOnDescription: true,
					matchOnDetail: true,
				},
			);
			if (selected) {
				await this.navigate(source, version, offset, generation, selected.match.id);
			}
		} catch (error) {
			this.report(error);
		}
	}

	private report(error: unknown): void {
		if (this.disposed) {
			return;
		}
		if (error instanceof StaleQueryError) {
			void window.showInformationMessage(error.message);
			return;
		}
		this.output.error('Unable to navigate Go implementation annotations', error);
		void window.showErrorMessage(
			`Go Interfaces: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	dispose(): void {
		this.disposed = true;
		clearTimeout(this.timer);
		this.active?.request.cancel();
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
		this.documents.clear();
		this.previous.clear();
		this.changed.dispose();
	}
}
