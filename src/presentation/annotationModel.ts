import { Range, window, workspace, type TextDocument } from 'vscode';
import type { GoFile } from '../core/types';
import type { QueryResult } from '../query/model';

export const openRelation = 'goInterfaces.openRelation';
export const showRelations = 'goInterfaces.showRelations';
export const retryRelation = 'goInterfaces.retryRelation';
export const inlineLimit = 6;

export type RetryRelationArguments = [source: string, version: number, offset: number];
export type ShowRelationsArguments = [...RetryRelationArguments, generation: number];
export type OpenRelationArguments = [...ShowRelationsArguments, target: string];

// Define mutually exclusive annotation result states.
// 定义互斥的标注结果状态
export type AnnotationState =
	| { readonly kind: 'pending' }
	| { readonly kind: 'stale'; readonly result: QueryResult }
	| { readonly kind: 'ready'; readonly result: QueryResult }
	| { readonly kind: 'failed'; readonly message: string };

export interface Annotation {
	// Stable key for each declaration name and occurrence.
	// 每个声明名称及其出现序号的稳定键
	readonly key: string;
	readonly start: number;
	readonly range: Range;
	state: AnnotationState;
}

export interface DocumentAnnotations {
	readonly document: TextDocument;
	readonly version: number;
	readonly items: readonly Annotation[];
	// Track whether syntax errors block document queries.
	// 标记语法错误是否阻止文档查询
	readonly blocked: boolean;
}

// Describe the loaded, retained, or empty annotation view.
// 描述已加载、保留或空的标注视图
export type DocumentView =
	| { readonly kind: 'loaded'; readonly state: DocumentAnnotations }
	| { readonly kind: 'retained' }
	| { readonly kind: 'empty' };

export type AnnotationChange =
	| { readonly kind: 'invalidated' }
	| { readonly kind: 'document'; readonly uri: string }
	| { readonly kind: 'editors' };

export function documentView(
	state: DocumentAnnotations | undefined,
	retained: boolean,
): DocumentView {
	if (state) {
		return { kind: 'loaded', state };
	}
	return retained ? { kind: 'retained' } : { kind: 'empty' };
}

export interface ShownResult {
	readonly result: QueryResult;
	readonly stale: boolean;
}

export function shownResult(item: Annotation): ShownResult | undefined {
	if (item.state.kind === 'ready') {
		return { result: item.state.result, stale: false };
	}
	if (item.state.kind === 'stale') {
		return { result: item.state.result, stale: true };
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

export function annotationsAvailable(document: TextDocument): boolean {
	return (
		(annotationsEnabled(document, 'codeLens') || annotationsEnabled(document, 'gutterIcons')) &&
		window.visibleTextEditors.some((editor) => editor.document === document)
	);
}

export function relationArguments(
	state: DocumentAnnotations,
	item: Annotation,
	result: QueryResult,
): ShowRelationsArguments {
	return [...retryArguments(state, item), result.generation];
}

export function retryArguments(
	state: DocumentAnnotations,
	item: Annotation,
): RetryRelationArguments {
	return [state.document.uri.toString(), state.version, item.start];
}

export function openRelationArguments(
	args: ShowRelationsArguments,
	target: string,
): OpenRelationArguments {
	return [...args, target];
}

export function createAnnotations(
	document: TextDocument,
	version: number,
	file: GoFile,
	retained: ReadonlyMap<string, QueryResult> | undefined,
): DocumentAnnotations {
	const occurrences = new Map<string, number>();
	const items: Annotation[] = [];
	for (const declaration of file.declarations) {
		if (
			declaration.kind === 'unsupported' ||
			(declaration.generic &&
				(declaration.kind !== 'struct' || declaration.embedded || declaration.alias))
		) {
			continue;
		}
		if (declaration.kind !== 'reference' && (declaration.constraint || declaration.empty)) {
			continue;
		}
		const occurrence = occurrences.get(declaration.name) ?? 0;
		occurrences.set(declaration.name, occurrence + 1);
		const key = `${declaration.name}#${occurrence}`;
		const previous = retained?.get(key);
		items.push({
			key,
			start: declaration.start,
			range: new Range(
				document.positionAt(declaration.start),
				document.positionAt(declaration.end),
			),
			state: previous ? { kind: 'stale', result: previous } : { kind: 'pending' },
		});
	}
	return { document, version, items, blocked: file.hasErrors };
}

// Retain displayed results while a new query runs.
// 新查询运行期间保留已展示的结果
export function retainAnnotations(state: DocumentAnnotations): Map<string, QueryResult> {
	const results = new Map<string, QueryResult>();
	for (const item of state.items) {
		const shown = shownResult(item);
		if (shown) {
			results.set(item.key, shown.result);
		}
	}
	return results;
}
