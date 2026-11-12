import {
	CodeLens,
	l10n,
	workspace,
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
	inlineLimit,
	openRelation,
	relationArguments,
	retryRelation,
	shownResult,
	showRelations,
} from './annotationModel';
import { findImplementations } from './commands';
import { relationDirection, relationSummary } from './labels';

// Show stale results without navigation commands.
// 展示过期结果时不提供导航命令
function relationLenses(
	range: Range,
	result: QueryResult,
	args: readonly unknown[] | undefined,
): CodeLens[] {
	const summary = relationSummary(result);
	const refreshing = l10n.t('Refreshing implementation relations after a change…');
	// Place the full-list action first.
	// 将完整列表入口放在最前面
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
			// Keep earlier results while syntax errors block new queries.
			// 语法错误阻止新查询时保留先前结果
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
