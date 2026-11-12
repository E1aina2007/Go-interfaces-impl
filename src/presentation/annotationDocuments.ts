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
	// Results kept per document URI and declaration key while the next query runs.
	// 按文档 URI 和声明键保存的结果，在下一次查询完成前继续展示
	private readonly previous = new Map<string, Map<string, QueryResult>>();
	private revision = 0;
	private disposed = false;

	constructor(
		private readonly syntax: GoSyntax,
		private readonly output: LogOutputChannel,
		private readonly changed: (uri: string) => void,
		private readonly schedule: () => void,
	) {}

	find(source: string): DocumentAnnotations | undefined {
		return this.documents.get(source);
	}

	get(document: TextDocument): DocumentAnnotations | undefined {
		const state = this.find(document.uri.toString());
		return state?.document === document && state.version === document.version
			? state
			: undefined;
	}

	values(): IterableIterator<DocumentAnnotations> {
		return this.documents.values();
	}

	// Retain even an empty record until the current document has been read again.
	// 即使保留记录为空，也要等当前文档重新读取后才结束保留阶段
	view(document: TextDocument): DocumentView {
		return documentView(this.get(document), this.previous.has(document.uri.toString()));
	}

	invalidate(): void {
		this.revision++;
		for (const [uri, state] of this.documents) {
			this.previous.set(uri, retainAnnotations(state));
		}
		this.documents.clear();
		this.loading.clear();
		this.prune();
	}

	load(document: TextDocument): Promise<DocumentAnnotations | undefined> {
		if (this.disposed || !annotationsAvailable(document)) {
			this.drop(document);
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
		// Register before starting work so all editor entry points share this load.
		// 先登记再开始读取，让各个编辑器入口共用同一次加载
		const result = Promise.resolve()
			.then(() => this.read(request))
			.finally(() => {
				// A detached load must not remove a newer load for the same document.
				// 已脱离缓存的旧加载不能删除同一文档的新加载
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
			// Recheck after each wait: hidden or superseded loads must not parse or repopulate caches.
			// 每次等待后重新检查，已隐藏或被替代的加载不能继续解析或重新写入缓存
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
			const retained = this.previous.get(uri);
			const state = createAnnotations(document, version, file, retained);
			this.documents.set(uri, state);
			this.previous.delete(uri);
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

	// Release cached state and detach pending work together so late loads cannot restore it.
	// 同时释放缓存状态并移除在途任务，防止迟到的加载重新恢复状态
	drop(document: TextDocument): boolean {
		const uri = document.uri.toString();
		const removed =
			this.documents.get(uri)?.document === document && this.documents.delete(uri);
		const retained = this.previous.delete(uri);
		const loading = this.loading.delete(document);
		if ((removed || retained) && !this.disposed) {
			this.changed(uri);
		}
		return removed || retained || loading;
	}

	prune(): void {
		for (const [uri, state] of this.documents) {
			if (!annotationsAvailable(state.document)) {
				this.documents.delete(uri);
			}
		}
		for (const document of this.loading.keys()) {
			if (!annotationsAvailable(document)) {
				this.loading.delete(document);
			}
		}
		for (const uri of this.previous.keys()) {
			if (
				!window.visibleTextEditors.some(
					(editor) =>
						editor.document.uri.toString() === uri &&
						annotationsAvailable(editor.document),
				)
			) {
				this.previous.delete(uri);
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
