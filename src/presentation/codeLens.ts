import {
	CodeLens,
	workspace,
	type CancellationToken,
	type CodeLensProvider,
	type TextDocument,
} from 'vscode';
import {
	annotationsEnabled,
	inlineLimit,
	openRelation,
	relationArguments,
	relationDirection,
	relationSummary,
	retryRelation,
	showRelations,
	type ImplementationAnnotations,
} from './annotations';
import { findImplementations } from './commands';

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
		if (!state || token.isCancellationRequested) {
			return [];
		}
		const lenses: CodeLens[] = [];
		for (const item of state.items) {
			const result = item.result;
			if (!result) {
				lenses.push(
					new CodeLens(item.range, {
						title: item.error
							? 'Unable to load relations · Retry'
							: 'Finding implementation relations…',
						tooltip: item.error ?? 'Automatically query the visible type declarations.',
						command: item.error ? retryRelation : findImplementations,
						arguments: item.error
							? [document.uri.toString(), state.version, item.start]
							: [document.uri, item.range.start, state.version],
					}),
				);
				continue;
			}
			const args = relationArguments(state, item, result);
			if (result.matches.length === 0) {
				continue;
			}
			// Keep the full-list action first so narrow editors do not hide it behind long type names.
			// 将完整列表入口放在最前面，避免窄编辑器中的长类型名称遮住该入口
			lenses.push(
				new CodeLens(item.range, {
					title: `${relationDirection(result)} (${result.matches.length})`,
					tooltip: relationSummary(result),
					command: showRelations,
					arguments: args,
				}),
			);
			for (const match of result.matches.slice(0, inlineLimit)) {
				lenses.push(
					new CodeLens(item.range, {
						title: `${match.declaration.name}${result.unverifiedTesting.has(match.id) ? ' ?' : ''}`,
						tooltip: `${workspace.asRelativePath(match.location.uri)}:${match.location.range.start.line + 1}\n${relationSummary(result)}`,
						command: openRelation,
						arguments: [...args, match.id],
					}),
				);
			}
		}
		return lenses;
	}
}
