import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AnalysisInput, DocumentOverlay, QueryRequest } from '../application/contracts';
import type { AnalysisSnapshot } from '../domain/types';
import { canonicalFileUri, fileKey, WorkspaceError, type ModuleContext } from './module';

export interface WorkspaceDocument {
	readonly uri: string;
	readonly languageId: string;
	readonly version: number;
	readonly text: string;
	readonly isDirty: boolean;
}

export class WorkspaceSnapshots {
	readonly #session = randomUUID();
	readonly #documents = new Map<string, WorkspaceDocument>();
	readonly #snapshots = new Map<string, AnalysisSnapshot>();
	#generation = 0;

	get generation(): number {
		return this.#generation;
	}

	updateDocument(document: WorkspaceDocument): boolean {
		const previous = this.#documents.get(document.uri);
		if (
			previous?.version === document.version &&
			previous.text === document.text &&
			previous.isDirty === document.isDirty &&
			previous.languageId === document.languageId
		) {
			return false;
		}
		this.#documents.set(document.uri, { ...document });
		this.invalidate();
		return true;
	}

	closeDocument(uri: string): boolean {
		if (!this.#documents.delete(uri)) {
			return false;
		}
		this.invalidate();
		return true;
	}

	unsavedConfigurationUris(): string[] {
		return [...this.#documents.values()]
			.filter((document) => document.isDirty && isWorkspaceConfiguration(document.uri))
			.map((document) => document.uri);
	}

	invalidate(): void {
		// Invalidate conservatively until the analyzer can provide a precise dependency graph.
		// 在分析器能提供精确依赖图之前，保守地使所有已记录模块的快照失效
		this.#generation++;
		this.#snapshots.clear();
	}

	isCurrent(snapshot: AnalysisSnapshot): boolean {
		return (
			snapshot.generation === this.#generation &&
			this.#snapshots.get(fileKey(snapshot.module.goModUri))?.id === snapshot.id
		);
	}

	async capture(
		context: ModuleContext,
		request: QueryRequest,
		generation: number,
	): Promise<AnalysisInput> {
		const source = this.#documents.get(request.source.uri);
		if (generation !== this.#generation || source?.version !== request.source.version) {
			throw new WorkspaceError({ status: 'stale' });
		}
		if (source.languageId !== 'go' || isWorkspaceConfiguration(source.uri)) {
			throw new WorkspaceError({
				status: 'unsupported',
				reason: 'not-a-named-struct-or-interface',
			});
		}
		if (fileKey(await canonicalFileUri(source.uri)) !== fileKey(context.sourceUri)) {
			throw new WorkspaceError({ status: 'stale' });
		}
		const documents = [...this.#documents.values()].filter(
			(document) => document.languageId === 'go' && !isWorkspaceConfiguration(document.uri),
		);
		const resolved = await Promise.all(
			documents.map(async (document): Promise<DocumentOverlay> => ({
				uri: await canonicalFileUri(document.uri),
				version: document.version,
				text: document.text,
			})),
		);
		const overlays = new Map<string, DocumentOverlay>();
		for (const document of resolved) {
			const key = fileKey(document.uri);
			const previous = overlays.get(key);
			if (previous && previous.text !== document.text) {
				throw new WorkspaceError({
					status: 'failed',
					error: {
						code: 'package-load-failed',
						message: 'The same Go file has conflicting editor contents.',
					},
				});
			}
			overlays.set(key, document);
		}
		const canonicalSource = {
			uri: context.sourceUri,
			version: source.version,
			text: source.text,
		};
		overlays.set(fileKey(canonicalSource.uri), canonicalSource);
		const captured = [...overlays.values()].sort((left, right) =>
			left.uri.localeCompare(right.uri),
		);
		if (generation !== this.#generation) {
			throw new WorkspaceError({ status: 'stale' });
		}
		// Include buffer contents, not only paths, so unsaved edits get a different snapshot identity.
		// 快照标识同时包含缓冲区内容与路径，让未保存改动生成不同的快照
		const snapshot: AnalysisSnapshot = {
			id: createHash('sha256')
				.update(JSON.stringify([this.#session, generation, context.build.key, captured]))
				.digest('hex'),
			generation,
			module: context.module,
			build: context.build,
		};
		this.#snapshots.set(fileKey(context.module.goModUri), snapshot);
		return {
			requestId: request.id,
			source: { ...request.source, uri: context.sourceUri },
			direction: request.options.direction,
			snapshot,
			overlays: captured,
		};
	}

	dispose(): void {
		this.#documents.clear();
		this.#snapshots.clear();
		this.#generation++;
	}
}

export function isWorkspaceConfiguration(uri: string): boolean {
	return ['go.mod', 'go.sum', 'go.work', 'go.work.sum'].includes(
		path.basename(fileURLToPath(uri)),
	);
}
