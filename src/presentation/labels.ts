import { l10n } from 'vscode';
import type { QueryResult } from '../query/service';

export function relationDirection(result: QueryResult): string {
	return result.subject.declaration.kind === 'struct'
		? l10n.t('Implements')
		: l10n.t('Implemented by');
}

export function relationSummary(result: QueryResult): string {
	const parts = [
		l10n.t('Language-service results may be incomplete'),
		l10n.t('{0} filtered', result.hidden),
		l10n.t('{0} unsupported', result.skipped),
	];
	// Unreadable candidates only appear while files are being edited; keep the summary short otherwise.
	// 仅在文件编辑中才会出现无法读取的候选，其余情况保持摘要简短
	if (result.unreadable > 0) {
		parts.push(l10n.t('{0} unreadable (syntax errors)', result.unreadable));
	}
	parts.push(l10n.t('{0} test sources unverified', result.unverifiedTesting.size));
	return parts.join(' · ');
}

// Suffix for result details whose testing sources could not be fully classified.
// 测试来源未能完全确认时附加在结果详情后的说明
export function unverifiedNote(result: QueryResult, id: string): string {
	return result.unverifiedTesting.has(id) ? ` · ${l10n.t('Test sources unverified')}` : '';
}

export function errorMessage(error: unknown): string {
	return `Go Interfaces: ${error instanceof Error ? error.message : String(error)}`;
}
