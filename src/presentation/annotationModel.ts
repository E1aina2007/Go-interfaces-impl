import { Range, window, workspace, type TextDocument } from 'vscode';
import type { GoFile } from '../core/types';
import type { QueryResult } from '../query/model';

export const openRelation = 'goInterfaces.openRelation';
export const showRelations = 'goInterfaces.showRelations';
export const retryRelation = 'goInterfaces.retryRelation';
export const inlineLimit = 6;

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
): unknown[] {
	return [state.document.uri.toString(), state.version, item.start, result.generation];
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
		if (declaration.generic || declaration.kind === 'unsupported') {
			continue;
		}
		if (declaration.kind !== 'reference' && (declaration.constraint || declaration.empty)) {
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
	return { document, version, items, blocked: file.hasErrors };
}

// Carry displayed results across invalidation so names and icons do not flicker while typing.
// 失效时保留已展示的结果，避免输入过程中名称和图标反复闪烁
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
