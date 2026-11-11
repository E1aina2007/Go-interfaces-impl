import {
	CodeLens,
	l10n,
	workspace,
	type CancellationToken,
	type CodeLensProvider,
	type Range,
	type TextDocument,
} from 'vscode';
import type { QueryResult } from '../query/model';
import type { ImplementationAnnotations } from './annotations';
import {
	annotationsEnabled,
	inlineLimit,
	openRelation,
	relationArguments,
	retryRelation,
	shownResult,
	showRelations,
} from './annotationModel';
import { findImplementations } from './commands';
import { relationDirection, relationSummary } from './labels';

// Stale results keep their layout but drop commands, so outdated targets cannot be opened.
// 过期结果保留原有布局但不绑定命令，避免打开已经失效的目标
function relationLenses(
	range: Range,
	result: QueryResult,
	args: readonly unknown[] | undefined,
): CodeLens[] {
	const summary = relationSummary(result);
	const refreshing = l10n.t('Refreshing implementation relations after a change…');
	// Keep the full-list action first so narrow editors do not hide it behind long type names.
	// 将完整列表入口放在最前面，避免窄编辑器中的长类型名称遮住该入口
	const lenses = [
		new CodeLens(range, {
			title: `${relationDirection(result)} (${result.matches.length})`,
			tooltip: args ? summary : refreshing,
			command: args ? showRelations : '',
			arguments: args ? [...args] : [],
		}),
	];
	for (const match of result.matches.slice(0, inlineLimit)) {
		const location = `${workspace.asRelativePath(match.location.uri)}:${match.location.range.start.line + 1}`;
		lenses.push(
			new CodeLens(range, {
				title: `${match.declaration.name}${result.unverifiedTesting.has(match.id) ? ' ?' : ''}`,
				tooltip: `${location}\n${args ? summary : refreshing}`,
				command: args ? openRelation : '',
				arguments: args ? [...args, match.id] : [],
			}),
		);
	}
	return lenses;
}

export class ImplementationLenses implements CodeLensProvider {
	readonly onDidChangeCodeLenses;

	constructor(private readonly annotations: ImplementationAnnotations) {
		this.onDidChangeCodeLenses = annotations.onDidChange;
	}

	async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (token.isCancellationRequested || !annotationsEnabled(document, 'codeLens')) {
			return [];
		}
		const state = await this.annotations.load(document);
		if (
			!state ||
			token.isCancellationRequested ||
			!annotationsEnabled(document, 'codeLens') ||
			this.annotations.get(document) !== state
		) {
			return [];
		}
		const lenses: CodeLens[] = [];
		for (const item of state.items) {
			if (item.error) {
				lenses.push(
					new CodeLens(item.range, {
						title: l10n.t('Unable to load relations · Retry'),
						tooltip: item.error,
						command: retryRelation,
						arguments: [document.uri.toString(), state.version, item.start],
					}),
				);
				continue;
			}
			const shown = shownResult(item);
			if (shown) {
				if (shown.result.matches.length > 0) {
					const args = shown.stale
						? undefined
						: relationArguments(state, item, shown.result);
					lenses.push(...relationLenses(item.range, shown.result, args));
				}
				continue;
			}
			// A file with syntax errors only keeps earlier results; it never starts new queries.
			// 存在语法错误的文件只保留先前结果，不发起新的查询
			if (state.blocked) {
				continue;
			}
			lenses.push(
				new CodeLens(item.range, {
					title: l10n.t('Finding implementation relations…'),
					tooltip: l10n.t('Automatically query the visible type declarations.'),
					command: findImplementations,
					arguments: [document.uri, item.range.start, state.version],
				}),
			);
		}
		return lenses;
	}
}
