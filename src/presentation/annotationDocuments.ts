import { window, type Disposable, type LogOutputChannel, type TextDocument } from 'vscode';
import type { GoSyntax } from '../core/syntax';
import type { QueryResult } from '../query/model';
import { findModule } from '../workspace/module';
import {
	annotationsAvailable,
	createAnnotations,
	documentView,
	retainAnnotations,
	type DocumentAnnotations,
	type DocumentView,
} from './annotationModel';

const hiddenDocumentLimit = 32;

interface DocumentLoad {
	readonly document: TextDocument;
	readonly version: number;
	readonly revision: number;
}

interface PendingDocumentLoad {
	readonly request: DocumentLoad;
	readonly result: Promise<DocumentAnnotations | undefined>;
}

export class AnnotationDocuments implements Disposable {
	private readonly documents = new Map<string, DocumentAnnotations>();
	private readonly loading = new Map<TextDocument, PendingDocumentLoad>();
	// Retained results keyed by document and declaration.
	// 按文档和声明保存的旧结果
	private readonly previous = new Map<TextDocument, Map<string, QueryResult>>();
	private revision = 0;
	private disposed = false;

	constructor(
		private readonly syntax: GoSyntax,
		private readonly output: LogOutputChannel,
		private readonly changed: (uri: string) => void,
		private readonly schedule: () => void,
	) {}

	find(source: string): DocumentAnnotations | undefined {
		const state = this.documents.get(source);
		if (!state || !annotationsAvailable(state.document)) {
			return undefined;
		}
		// Keep visible accesses in least-recently-used order for eviction.
		// 按可见文档的访问顺序回收最久未使用的缓存
		this.documents.delete(source);
		this.documents.set(source, state);
		return state;
	}

	get(document: TextDocument): DocumentAnnotations | undefined {
		const state = this.find(document.uri.toString());
		return state?.document === document && state.version === document.version
			? state
			: undefined;
	}

	*visible(): IterableIterator<DocumentAnnotations> {
		const documents = new Set(window.visibleTextEditors.map((editor) => editor.document));
		for (const document of documents) {
			const state = this.get(document);
			if (state) {
				yield state;
			}
		}
	}

	// Keep the retained view until the document is loaded again.
	// 文档重新加载前保持旧结果视图
	view(document: TextDocument): DocumentView {
		return documentView(this.get(document), this.previous.has(document));
	}

	invalidate(): void {
		this.revision++;
		for (const state of this.documents.values()) {
			if (annotationsAvailable(state.document)) {
				this.previous.set(state.document, retainAnnotations(state));
			}
		}
		this.documents.clear();
		this.loading.clear();
		this.prune();
	}

	load(document: TextDocument): Promise<DocumentAnnotations | undefined> {
		if (this.disposed || !annotationsAvailable(document)) {
			return Promise.resolve(undefined);
		}
		const previous = this.get(document);
		if (previous) {
			return Promise.resolve(previous);
		}
		const pending = this.loading.get(document);
		if (
			pending?.request.version === document.version &&
			pending.request.revision === this.revision
		) {
			return pending.result;
		}
		const request = { document, version: document.version, revision: this.revision };
		// Register the load before starting it.
		// 启动加载前先登记任务
		const result = Promise.resolve()
			.then(() => this.read(request))
			.finally(() => {
				// Remove the pending entry only when it still points to this load.
				// 仅在待处理项仍指向当前加载时移除它
				if (this.loading.get(document)?.request === request) {
					this.loading.delete(document);
				}
			});
		this.loading.set(document, { request, result });
		return result;
	}

	private currentLoad(request: DocumentLoad): boolean {
		return (
			!this.disposed &&
			this.loading.get(request.document)?.request === request &&
			request.document.version === request.version &&
			request.revision === this.revision &&
			annotationsAvailable(request.document)
		);
	}

	private async read(request: DocumentLoad): Promise<DocumentAnnotations | undefined> {
		const { document, version } = request;
		try {
			if (!this.currentLoad(request)) {
				return undefined;
			}
			const module = await findModule(document.uri.toString());
			// Confirm that this load is current after asynchronous work.
			// 异步操作后确认当前加载仍有效
			if (!this.currentLoad(request)) {
				return undefined;
			}
			if (!module) {
				this.drop(document);
				return undefined;
			}
			const file = await this.syntax.read(document.getText());
			if (!this.currentLoad(request)) {
				return undefined;
			}
			const uri = document.uri.toString();
			const retained = this.previous.get(document);
			const state = createAnnotations(document, version, file, retained);
			this.documents.delete(uri);
			this.documents.set(uri, state);
			this.trim();
			this.previous.delete(document);
			if (retained) {
				this.changed(uri);
			}
			this.schedule();
			return state;
		} catch (error) {
			if (this.currentLoad(request)) {
				this.output.error('Unable to read Go declarations for editor annotations', error);
				this.drop(document);
			}
			return undefined;
		}
	}

	// Clear cached state and detach the pending load.
	// 清除缓存状态并移除待处理加载
	drop(document: TextDocument): boolean {
		const uri = document.uri.toString();
		const removed =
			this.documents.get(uri)?.document === document && this.documents.delete(uri);
		const retained = this.previous.delete(document);
		const loading = this.loading.delete(document);
		if ((removed || retained) && !this.disposed) {
			this.changed(uri);
		}
		return removed || retained || loading;
	}

	trim(): void {
		const visible = new Set(window.visibleTextEditors.map((editor) => editor.document));
		const hidden: string[] = [];
		for (const [uri, state] of this.documents) {
			if (!visible.has(state.document)) {
				hidden.push(uri);
			}
		}
		for (const uri of hidden.slice(0, Math.max(0, hidden.length - hiddenDocumentLimit))) {
			this.documents.delete(uri);
		}
	}

	prune(): void {
		for (const [uri, state] of this.documents) {
			if (state.document.isClosed) {
				this.documents.delete(uri);
			}
		}
		for (const document of this.loading.keys()) {
			if (!annotationsAvailable(document)) {
				this.loading.delete(document);
			}
		}
		for (const document of this.previous.keys()) {
			if (!annotationsAvailable(document)) {
				this.previous.delete(document);
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.documents.clear();
		this.loading.clear();
		this.previous.clear();
	}
}
