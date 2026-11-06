import type { QueryResult } from '../query/service';

export function relationDirection(result: QueryResult): string {
	return result.subject.declaration.kind === 'struct' ? 'Implements' : 'Implemented by';
}

export function relationSummary(result: QueryResult): string {
	const parts = [
		'Language-service results may be incomplete',
		`${result.hidden} filtered`,
		`${result.skipped} unsupported`,
	];
	// Unreadable candidates only appear while files are being edited; keep the summary short otherwise.
	// 仅在文件编辑中才会出现无法读取的候选，其余情况保持摘要简短
	if (result.unreadable > 0) {
		parts.push(`${result.unreadable} unreadable (syntax errors)`);
	}
	parts.push(`${result.unverifiedTesting.size} test sources unverified`);
	return parts.join(' · ');
}
