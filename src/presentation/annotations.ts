import {
	EventEmitter,
	window,
	workspace,
	type Disposable,
	type LogOutputChannel,
	type TextDocument,
} from 'vscode';
import type { GoSyntax } from '../core/syntax';
import type { ImplementationQueries } from '../query/service';
import { AnnotationCommands } from './annotationCommands';
import { AnnotationDocuments } from './annotationDocuments';
import type { AnnotationChange, DocumentAnnotations, DocumentView } from './annotationModel';
import { AnnotationRefresh } from './annotationRefresh';

export class ImplementationAnnotations implements Disposable {
	private readonly changed = new EventEmitter<AnnotationChange>();
	private readonly documents: AnnotationDocuments;
	private readonly refresh: AnnotationRefresh;
	private readonly actions: AnnotationCommands;
	private readonly subscriptions: Disposable[];
	readonly onDidChange = this.changed.event;

	constructor(syntax: GoSyntax, queries: ImplementationQueries, output: LogOutputChannel) {
		this.documents = new AnnotationDocuments(
			syntax,
			output,
			(uri) => this.changed.fire({ kind: 'document', uri }),
			() => this.refresh.schedule(),
		);
		this.refresh = new AnnotationRefresh(this.documents, queries, output, (uri) =>
			this.changed.fire({ kind: 'document', uri }),
		);
		this.actions = new AnnotationCommands(this.documents, queries, output, (uri) => {
			this.changed.fire({ kind: 'document', uri });
			this.refresh.schedule();
		});
		this.subscriptions = [
			queries.onDidInvalidate(() => {
				this.refresh.cancel();
				this.documents.invalidate();
				this.changed.fire({ kind: 'invalidated' });
				this.refresh.schedule();
			}),
			window.onDidChangeVisibleTextEditors(() => {
				this.documents.prune();
				this.refresh.visibleChanged();
				this.changed.fire({ kind: 'editors' });
			}),
			window.onDidChangeTextEditorVisibleRanges(() => this.refresh.visibleChanged()),
			workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('editor.codeLens')) {
					this.documents.prune();
					this.refresh.visibleChanged();
					this.changed.fire({ kind: 'editors' });
				}
			}),
			workspace.onDidCloseTextDocument((document) => {
				if (this.documents.drop(document)) {
					this.refresh.visibleChanged();
				}
			}),
		];
		this.refresh.schedule();
	}

	view(document: TextDocument): DocumentView {
		return this.documents.view(document);
	}

	load(document: TextDocument): Promise<DocumentAnnotations | undefined> {
		return this.documents.load(document);
	}

	dispose(): void {
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
		// Stop callers before releasing their shared document state and notification channel.
		// 先停止调用方，再释放共用文档状态和通知通道
		this.actions.dispose();
		this.refresh.dispose();
		this.documents.dispose();
		this.changed.dispose();
	}
}
