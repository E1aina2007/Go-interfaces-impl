import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { l10n, workspace } from 'vscode';
import type { LocatedType, QueryResult, RelationMatch } from '../query/model';
import type { RelationSourceKind } from '../workspace/relationSources';

export function qualifiedTypeName(type: LocatedType): string {
	return type.packageName
		? `${type.packageName}.${type.declaration.name}`
		: type.declaration.name;
}

export function labeledMatches(
	result: QueryResult,
	limit?: number,
): { match: RelationMatch; label: string }[] {
	const directories = new Map<string, string>();
	const ambiguous = new Set<string>();
	// Check all visible matches before limiting inline labels to the first few.
	// 先检查全部可见结果中的同名类型，再截取行内显示的条目
	for (const match of result.matches) {
		const name = qualifiedTypeName(match);
		const previous = directories.get(name);
		if (previous !== undefined && previous !== match.packageDirectory) {
			ambiguous.add(name);
		}
		directories.set(name, match.packageDirectory);
	}
	const root = fileURLToPath(result.module.rootUri);
	return result.matches.slice(0, limit).map((match) => {
		const name = qualifiedTypeName(match);
		if (!ambiguous.has(name)) {
			return { match, label: name };
		}
		const { kind, importPath, version } = match.source;
		if (kind === 'module') {
			const directory = path.relative(root, match.packageDirectory).split(path.sep).join('/');
			return { match, label: `${name} (${directory || '.'})` };
		}
		const qualifier = `${relationSourceLabel(kind)} ${importPath ?? name}${version ? `@${version}` : ''}`;
		return { match, label: `${name} (${qualifier})` };
	});
}

export function relationSourceLabel(kind: RelationSourceKind): string {
	switch (kind) {
		case 'module':
			return l10n.t('Current module');
		case 'standard':
			return l10n.t('Standard library');
		case 'dependency':
			return l10n.t('Dependencies');
	}
}

export function relationDirection(result: QueryResult): string {
	return result.subject.declaration.kind === 'interface'
		? l10n.t('Implemented by')
		: l10n.t('Implements');
}

export function relationLocation(match: RelationMatch): string {
	const { uri, range } = match.location;
	const filename =
		match.source.kind === 'module'
			? workspace.asRelativePath(uri)
			: path.posix.basename(uri.path);
	return `${filename}:${range.start.line + 1}`;
}

export function relationSummary(result: QueryResult): string {
	const parts = [
		l10n.t('Language-service results may be incomplete'),
		result.hideTesting
			? l10n.t('Confirmed test sources hidden')
			: l10n.t('Test sources included'),
		l10n.t('{0} filtered', result.hidden),
		l10n.t('{0} unsupported', result.skipped),
	];
	if (result.unreadable > 0) {
		parts.push(l10n.t('{0} unreadable (syntax errors)', result.unreadable));
	}
	parts.push(l10n.t('{0} test sources unverified', result.unverifiedTesting.size));
	return parts.join(' · ');
}

// Label results with unverified test sources.
// 标记测试来源未确认的结果
export function unverifiedNote(result: QueryResult, id: string): string {
	return result.unverifiedTesting.has(id) ? ` · ${l10n.t('Test sources unverified')}` : '';
}

export function errorMessage(error: unknown): string {
	return l10n.t('Go Interfaces: {0}', error instanceof Error ? error.message : String(error));
}
