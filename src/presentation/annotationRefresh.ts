import {
	CancellationError,
	CancellationTokenSource,
	window,
	type Disposable,
	type LogOutputChannel,
} from 'vscode';
import { StaleQueryError } from '../query/model';
import type { ImplementationQueries } from '../query/service';
import type { AnnotationDocuments } from './annotationDocuments';
import { annotationsEnabled, type Annotation, type DocumentAnnotations } from './annotationModel';

const refreshDelay = 400;

interface PendingAnnotation {
	readonly state: DocumentAnnotations;
	readonly item: Annotation;
	readonly request: CancellationTokenSource;
}

export class AnnotationRefresh implements Disposable {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private active: PendingAnnotation | undefined;
	private running = false;
	private refreshAgain = false;
	private disposed = false;

	constructor(
		private readonly documents: AnnotationDocuments,
		private readonly queries: ImplementationQueries,
		private readonly output: LogOutputChannel,
		private readonly changed: (uri: string) => void,
	) {}

	cancel(): void {
		this.active?.request.cancel();
	}

	visibleChanged(): void {
		if (this.active && !this.visible(this.active.state, this.active.item)) {
			this.cancel();
		}
		this.schedule();
	}

	schedule(): void {
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
			this.documents.get(state.document) === state &&
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
				await this.documents.load(editor.document);
			}
			// Query visible declarations in a debounced, serialized refresh loop.
			// 在防抖串行的刷新流程中查询可见声明
			for (const state of this.documents.values()) {
				for (const item of state.items) {
					if (
						this.disposed ||
						state.blocked ||
						item.state.kind === 'ready' ||
						item.state.kind === 'failed' ||
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
							// Mark successful empty results as ready.
							// 将成功的空结果标记为就绪
							item.state = { kind: 'ready', result };
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
						item.state = {
							kind: 'failed',
							message: error instanceof Error ? error.message : String(error),
						};
						this.output.error(
							'Unable to query Go editor implementation annotations',
							error,
						);
					} finally {
						this.active = undefined;
						request.dispose();
					}
					if (!this.disposed) {
						this.changed(state.document.uri.toString());
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

	dispose(): void {
		this.disposed = true;
		clearTimeout(this.timer);
		this.cancel();
	}
}
