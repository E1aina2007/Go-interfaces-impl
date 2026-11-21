import {
	CodeLens,
	l10n,
	type CancellationToken,
	type CodeLensProvider,
	type Disposable,
	type Event,
	type Range,
	type TextDocument,
} from 'vscode';
import type { QueryResult } from '../query/model';
import type { ImplementationAnnotations } from './annotations';
import {
	annotationsEnabled,
	hasRelationActions,
	inlineLimit,
	openRelation,
	openRelationArguments,
	relationArguments,
	retryArguments,
	retryRelation,
	shownResult,
	showAllRelations,
	showRelations,
	type ShowRelationsArguments,
} from './annotationModel';
import { findImplementations } from './commands';
import {
	allRelationsLabel,
	labeledMatches,
	relationLocation,
	relationSummary,
	relationTitle,
} from './labels';

// Show stale results without navigation commands.
// 展示过期结果时不提供导航命令
function relationLenses(
	range: Range,
	result: QueryResult,
	args: ShowRelationsArguments | undefined,
): CodeLens[] {
	const refreshing = l10n.t('Refreshing implementation relations after a change…');
	const lenses: CodeLens[] = [];
	if (result.matches.length > 0) {
		const summary = args ? relationSummary(result) : refreshing;
		lenses.push(
			new CodeLens(range, {
				title: relationTitle(result),
				tooltip: summary,
				command: args ? showRelations : '',
				arguments: args ? [...args] : [],
			}),
		);
		for (const { match, label } of labeledMatches(result, inlineLimit)) {
			lenses.push(
				new CodeLens(range, {
					title: `${label}${result.unverifiedTesting.has(match.id) ? ' ?' : ''}`,
					tooltip: `${relationLocation(match)}\n${summary}`,
					command: args ? openRelation : '',
					arguments: args ? openRelationArguments(args, match.id) : [],
				}),
			);
		}
	}
	if (result.hasExternalCandidates) {
		lenses.push(
			new CodeLens(range, {
				title: allRelationsLabel(result),
				tooltip: args
					? l10n.t('Search the current module, standard library, and dependencies.')
					: refreshing,
				command: args ? showAllRelations : '',
				arguments: args ? [...args] : [],
			}),
		);
	}
	return lenses;
}

export class ImplementationLenses implements CodeLensProvider {
	readonly onDidChangeCodeLenses: Event<void>;

	constructor(private readonly annotations: ImplementationAnnotations) {
		this.onDidChangeCodeLenses = (listener, thisArgs, disposables): Disposable =>
			annotations.onDidChange(
				() => {
					listener.call(thisArgs, undefined);
				},
				undefined,
				disposables,
			);
	}

	async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (token.isCancellationRequested || !annotationsEnabled(document, 'codeLens')) {
			return [];
		}
		const state = await this.annotations.load(document);
		const view = this.annotations.view(document);
		if (
			!state ||
			token.isCancellationRequested ||
			!annotationsEnabled(document, 'codeLens') ||
			view.kind !== 'loaded' ||
			view.state !== state
		) {
			return [];
		}
		const lenses: CodeLens[] = [];
		for (const item of state.items) {
			if (item.state.kind === 'failed') {
				lenses.push(
					new CodeLens(item.range, {
						title: l10n.t('Unable to load relations · Retry'),
						tooltip: item.state.message,
						command: retryRelation,
						arguments: retryArguments(state, item),
					}),
				);
				continue;
			}
			const shown = shownResult(item);
			if (shown) {
				if (hasRelationActions(shown.result)) {
					const args = shown.stale
						? undefined
						: relationArguments(state, item, shown.result);
					lenses.push(...relationLenses(item.range, shown.result, args));
				}
				continue;
			}
			// Keep earlier results while syntax errors block new queries.
			// 语法错误阻止新查询时保留先前结果
			if (state.blocked) {
				continue;
			}
			lenses.push(
				new CodeLens(item.range, {
					title: l10n.t('Finding implementation relations…'),
					tooltip: l10n.t(
						'Automatically find current-module results for visible declarations.',
					),
					command: findImplementations,
					arguments: [document.uri, item.range.start, state.version],
				}),
			);
		}
		return lenses;
	}
}
