import { ThemeIcon, workspace, type QuickPickItem, type QuickPickOptions } from 'vscode';
import type { QueryResult } from '../query/model';
import type { LocatedType } from '../query/resolve';
import { relationDirection, relationSummary, unverifiedNote } from './labels';

export interface RelationItem extends QuickPickItem {
	readonly match: LocatedType;
}

export function createRelationItems(result: QueryResult, showIcons: boolean): RelationItem[] {
	return result.matches.map((match) => {
		const item: RelationItem = {
			label: match.declaration.name,
			description: workspace.asRelativePath(match.location.uri),
			detail: `${match.location.uri.fsPath}:${match.location.range.start.line + 1}${unverifiedNote(result, match.id)}`,
			match,
		};
		if (showIcons) {
			item.iconPath = new ThemeIcon(
				match.declaration.kind === 'struct' ? 'symbol-struct' : 'symbol-interface',
			);
		}
		return item;
	});
}

export function createRelationPickOptions(result: QueryResult): QuickPickOptions {
	return {
		title: `${result.subject.declaration.name} · ${relationDirection(result)}`,
		placeHolder: relationSummary(result),
		matchOnDescription: true,
		matchOnDetail: true,
	};
}
