import { l10n } from 'vscode';
import type { QueryResult } from '../query/model';

export function relationDirection(result: QueryResult): string {
	return result.subject.declaration.kind === 'interface'
		? l10n.t('Implemented by')
		: l10n.t('Implements');
}

export function relationSummary(result: QueryResult): string {
	const parts = [
		l10n.t('Language-service results may be incomplete'),
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
	return `Go Interfaces: ${error instanceof Error ? error.message : String(error)}`;
}
