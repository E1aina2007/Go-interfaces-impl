import {
	QuickPickItemKind,
	ThemeIcon,
	workspace,
	type QuickPickItem,
	type QuickPickOptions,
} from 'vscode';
import type { QueryResult, RelationMatch } from '../query/model';
import type { RelationSourceKind } from '../workspace/relationSources';
import {
	labeledMatches,
	qualifiedTypeName,
	relationDirection,
	relationLocation,
	relationSourceLabel,
	relationSummary,
	unverifiedNote,
} from './labels';

export interface RelationItem extends QuickPickItem {
	readonly match?: RelationMatch;
}

export function createRelationItems(result: QueryResult, showIcons: boolean): RelationItem[] {
	const items: RelationItem[] = [];
	let group: RelationSourceKind | undefined;
	for (const { match, label } of labeledMatches(result)) {
		const { kind, importPath, version } = match.source;
		if (group !== kind) {
			group = kind;
			items.push({ kind: QuickPickItemKind.Separator, label: relationSourceLabel(kind) });
		}
		const packagePath = importPath ?? workspace.asRelativePath(match.location.uri);
		const item: RelationItem = {
			label,
			description: version ? `${packagePath} · ${version}` : packagePath,
			detail: `${relationLocation(match)}${unverifiedNote(result, match.id)}`,
			match,
		};
		if (showIcons) {
			const kind = match.declaration.kind;
			const icons = {
				struct: 'symbol-struct',
				interface: 'symbol-interface',
				function: 'symbol-method',
				basic: 'symbol-value',
				array: 'symbol-array',
				slice: 'symbol-array',
				map: 'symbol-object',
				channel: 'symbol-event',
			};
			item.iconPath = new ThemeIcon(icons[kind]);
		}
		items.push(item);
	}
	return items;
}

export function createRelationPickOptions(result: QueryResult): QuickPickOptions {
	return {
		title: `${qualifiedTypeName(result.subject)} · ${relationDirection(result)}`,
		placeHolder: relationSummary(result),
		matchOnDescription: true,
		matchOnDetail: true,
	};
}
