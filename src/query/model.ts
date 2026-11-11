import { l10n, type Location, type TextDocument, type Uri } from 'vscode';
import type { GoFile, GoType } from '../core/types';
import type { GoModule } from '../workspace/module';

export type QueryKind = 'concrete' | 'interface' | 'auto';

export interface CapturedFile {
	readonly document: TextDocument;
	readonly version: number;
	readonly syntax: GoFile;
}

export interface LocatedType {
	readonly id: string;
	readonly declaration: GoType;
	readonly location: Location;
	readonly testing: boolean;
	readonly methods: readonly LocatedMethod[];
	readonly interfaces: readonly (Location | null)[];
}

export interface LocatedMethod {
	readonly id: string;
	readonly name: string;
	readonly location: Location;
}

// A typed error lets callers degrade only candidates whose files are mid-edit.
// 使用独立错误类型，便于调用方只对正在编辑的候选文件降级处理
export class GoSyntaxError extends Error {
	constructor(readonly uri: Uri) {
		super(l10n.t('Fix Go syntax errors in {0} before querying.', uri.fsPath));
	}
}

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
