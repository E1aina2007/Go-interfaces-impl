import {
	CancellationError,
	CancellationTokenSource,
	window,
	type Disposable,
	type LogOutputChannel,
	type TextDocument,
} from 'vscode';
import { StaleQueryError } from '../query/model';
import type { ImplementationQueries } from '../query/service';
import type { AnnotationDocuments } from './annotationDocuments';
import { annotationsEnabled, type Annotation, type DocumentAnnotations } from './annotationModel';

const refreshDelay = 400;
const offscreenGrace = 400;

interface PendingAnnotation {
	readonly state: DocumentAnnotations;
	readonly item: Annotation;
	readonly request: CancellationTokenSource;
}

export class AnnotationRefresh implements Disposable {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private offscreenTimer: ReturnType<typeof setTimeout> | undefined;
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

	cancel(document?: TextDocument): void {
		const active = this.active;
		if (!active || (document && active.state.document !== document)) {
			return;
		}
		this.clearOffscreenTimer();
		active.request.cancel();
	}

	visibleChanged(): void {
		this.updateVisibility();
		this.schedule();
	}

	documentLoaded(): void {
		// Loading a document must not postpone an already scheduled refresh.
		// 文档加载完成时不推迟已经安排的刷新
		if (!this.timer && !this.refreshAgain) {
			this.schedule();
		}
	}

	schedule(): void {
		if (this.disposed) {
			return;
		}
		clearTimeout(this.timer);
		this.refreshAgain = false;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.refresh();
		}, refreshDelay);
	}

	private clearOffscreenTimer(): void {
		clearTimeout(this.offscreenTimer);
		this.offscreenTimer = undefined;
	}

	private updateVisibility(): void {
		const active = this.active;
		if (!active || active.request.token.isCancellationRequested) {
			return;
		}
		if (this.visible(active.state, active.item)) {
			this.clearOffscreenTimer();
		} else if (!this.isCurrent(active.state)) {
			this.cancel();
		} else {
			// Keep the deadline fixed while the declaration stays offscreen.
			// 声明持续离屏时保持宽限截止时间不变
			this.offscreenTimer ??= setTimeout(() => {
				if (this.active !== active) {
					return;
				}
				this.offscreenTimer = undefined;
				if (!this.visible(active.state, active.item)) {
					this.cancel();
				}
			}, offscreenGrace);
		}
	}

	private isCurrent(state: DocumentAnnotations): boolean {
		return (
			this.documents.isCurrent(state) &&
			(annotationsEnabled(state.document, 'codeLens') ||
				annotationsEnabled(state.document, 'gutterIcons'))
		);
	}

	private visible(state: DocumentAnnotations, item: Annotation): boolean {
		return (
			this.documents.get(state.document) === state &&
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
		// VS Code can briefly report no visible editors during a tab switch.
		// 切换标签页时 VS Code 可能短暂报告没有可见编辑器
		this.documents.trim();
		if (this.running) {
			this.refreshAgain = true;
			this.updateVisibility();
			return;
		}
		this.running = true;
		try {
			for (const editor of window.visibleTextEditors) {
				await this.documents.load(editor.document);
			}
			// Query visible declarations in a debounced, serialized refresh loop.
			// 在防抖串行的刷新流程中查询可见声明
			for (const state of this.documents.visible()) {
				for (const item of state.items) {
					if (this.refreshAgain) {
						return;
					}
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
					let updated = false;
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
							this.isCurrent(state) &&
							this.queries.isCurrent(result)
						) {
							// Mark successful empty results as ready.
							// 将成功的空结果标记为就绪
							item.state = { kind: 'ready', result };
							updated = true;
						}
					} catch (error) {
						if (
							this.disposed ||
							request.token.isCancellationRequested ||
							error instanceof CancellationError ||
							error instanceof StaleQueryError ||
							!this.isCurrent(state)
						) {
							return;
						}
						if (this.visible(state, item)) {
							item.state = {
								kind: 'failed',
								message: error instanceof Error ? error.message : String(error),
							};
							updated = true;
						}
						this.output.error(
							'Unable to query Go editor implementation annotations',
							error,
						);
					} finally {
						this.clearOffscreenTimer();
						this.active = undefined;
						request.dispose();
					}
					if (updated && this.documents.get(state.document) === state) {
						this.changed(state.document.uri.toString());
					}
				}
			}
		} finally {
			this.running = false;
			if (this.refreshAgain) {
				this.refreshAgain = false;
				// The queued refresh has already waited for the debounce.
				// 已排队的刷新已经完成防抖等待
				void this.refresh();
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		clearTimeout(this.timer);
		this.cancel();
	}
}
