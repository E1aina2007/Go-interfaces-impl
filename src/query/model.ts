import { l10n } from 'vscode';
import type { GoModule } from '../workspace/module';
import type { LocatedType } from './resolve';

export interface QueryResult {
	readonly coverage: 'provider-limited';
	readonly module: GoModule;
	readonly subject: LocatedType;
	readonly matches: readonly LocatedType[];
	readonly hidden: number;
	readonly unverifiedTesting: ReadonlySet<string>;
	readonly skipped: number;
	readonly unreadable: number;
	readonly hideTesting: boolean;
	readonly generation: number;
}

export class StaleQueryError extends Error {
	constructor() {
		super(l10n.t('Go sources or settings changed. Run the query again.'));
	}
}
