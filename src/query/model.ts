import { l10n, type Location, type TextDocument, type Uri } from 'vscode';
import type { GoFile, GoType } from '../core/types';
import type { GoModule } from '../workspace/module';
import type { RelationScope, RelationSource } from '../workspace/relationSources';

export type QueryKind = 'concrete' | 'interface' | 'auto';

export interface QueryOptions {
	readonly expected: QueryKind;
	readonly scope: RelationScope;
	readonly sourceVersion: number | undefined;
}

export interface CapturedFile {
	readonly document: TextDocument;
	readonly version: number;
	readonly syntax: GoFile;
}

export interface LocatedType {
	readonly id: string;
	readonly packageName: string | undefined;
	readonly packageDirectory: string;
	readonly declaration: GoType;
	readonly location: Location;
	readonly testing: boolean;
	readonly methods: readonly LocatedMethod[];
	readonly interfaces: readonly (Location | null)[];
}

export interface RelationMatch extends LocatedType {
	readonly source: RelationSource;
}

export interface LocatedMethod {
	readonly id: string;
	readonly name: string;
	readonly location: Location;
}

// Error raised when a candidate file has syntax errors.
// 候选文件存在语法错误时抛出此错误
export class GoSyntaxError extends Error {
	constructor(readonly uri: Uri) {
		super(l10n.t('Fix Go syntax errors in {0} before querying.', uri.fsPath));
	}
}

export interface QueryResult {
	readonly coverage: 'provider-limited';
	readonly module: GoModule;
	readonly subject: LocatedType;
	readonly matches: readonly RelationMatch[];
	readonly hidden: number;
	readonly unverifiedTesting: ReadonlySet<string>;
	readonly skipped: number;
	readonly unreadable: number;
	// Effective filtering for this query, including its original file context.
	// 本次查询实际生效的过滤状态，包含原始文件上下文
	readonly hideTesting: boolean;
	readonly generation: number;
}

export class StaleQueryError extends Error {
	constructor() {
		super(l10n.t('Go sources or settings changed. Run the query again.'));
	}
}
