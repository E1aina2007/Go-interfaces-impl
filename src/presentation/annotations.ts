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

export const openRelation = 'goInterfaces.openRelation';
export const showRelations = 'goInterfaces.showRelations';
export const retryRelation = 'goInterfaces.retryRelation';
export const inlineLimit = 6;
const refreshDelay = 400;

export interface Annotation {
	readonly start: number;
	readonly range: Range;
	result?: QueryResult;
	error?: string;
}

export interface DocumentAnnotations {
	readonly document: TextDocument;
	readonly version: number;
	readonly items: readonly Annotation[];
}

interface PendingAnnotation {
	readonly state: DocumentAnnotations;
	readonly item: Annotation;
	readonly request: CancellationTokenSource;
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

export function relationDirection(result: QueryResult): string {
	return result.subject.declaration.kind === 'struct' ? 'Implements' : 'Implemented by';
}

export function relationSummary(result: QueryResult): string {
	return `Language-service results may be incomplete · ${result.hidden} filtered · ${result.skipped} unsupported · ${result.unverifiedTesting.size} test sources unverified`;
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

	async load(document: TextDocument): Promise<DocumentAnnotations | undefined> {
		if (
			this.disposed ||
			(!annotationsEnabled(document, 'codeLens') &&
				!annotationsEnabled(document, 'gutterIcons'))
		) {
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
				return undefined;
			}
			const file = await this.syntax.read(document.getText());
			if (
				this.disposed ||
				document.isClosed ||
				document.version !== version ||
				revision !== this.revision ||
				file.hasErrors
			) {
				return undefined;
			}
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
				items.push({
					start: declaration.start,
					range: new Range(
						document.positionAt(declaration.start),
						document.positionAt(declaration.end),
					),
				});
			}
			// Concurrent CodeLens and editor callbacks must share the same result storage.
			// CodeLens 与编辑器回调并行到达时，必须共用同一份结果存储
			const existing = this.get(document);
			if (existing) {
				return existing;
			}
			const state = { document, version, items };
			this.documents.set(document.uri.toString(), state);
			this.schedule();
			return state;
		} catch (error) {
			if (!this.disposed) {
				this.output.error('Unable to read Go declarations for editor annotations', error);
			}
			return undefined;
		}
	}

	private visibleChanged(): void {
		if (this.active && !this.visible(this.active.state, this.active.item)) {
			this.active.request.cancel();
		}
		this.schedule();
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
					if (this.disposed || item.result || item.error || !this.visible(state, item)) {
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
		this.changed.dispose();
	}
}
