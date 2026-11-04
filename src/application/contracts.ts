import type {
	AnalysisSnapshot,
	QueryAnalysis,
	QueryDirection,
	QueryResult,
	SourcePosition,
} from '../domain/types';

export interface DocumentPosition {
	readonly uri: string;
	readonly version: number;
	readonly position: SourcePosition;
}

export interface DocumentOverlay {
	readonly uri: string;
	readonly version: number;
	readonly text: string;
}

export interface QueryOptions {
	readonly direction: QueryDirection | 'auto';
	readonly hideTestingImplementations: boolean;
}

export interface QueryRequest {
	readonly id: string;
	readonly source: DocumentPosition;
	readonly options: QueryOptions;
}

export interface AnalysisInput {
	readonly requestId: string;
	readonly source: DocumentPosition;
	readonly direction: QueryDirection | 'auto';
	readonly snapshot: AnalysisSnapshot;
	readonly overlays: readonly DocumentOverlay[];
}

export type UnsupportedReason =
	| 'not-a-named-struct-or-interface'
	| 'direction-mismatch'
	| 'constraint-interface'
	| 'uninstantiated-generic'
	| 'excluded-by-build'
	| 'unsaved-module-config'
	| 'virtual-workspace';

export interface QueryFailure {
	readonly code:
		| 'module-not-found'
		| 'workspace-untrusted'
		| 'go-not-found'
		| 'unsupported-go-version'
		| 'package-load-failed'
		| 'analyzer-unavailable'
		| 'protocol-error'
		| 'timeout'
		| 'internal-error';
	readonly message: string;
}

// Failed or obsolete work must never be presented as a successful query with no matches.
// 失败或过期的分析不能展示为查询成功但没有匹配结果
export type UnsuccessfulOutcome =
	| { readonly status: 'unsupported'; readonly reason: UnsupportedReason }
	| { readonly status: 'failed'; readonly error: QueryFailure }
	| { readonly status: 'cancelled' }
	| { readonly status: 'stale' };

export type AnalysisOutcome =
	{ readonly status: 'ready'; readonly result: QueryAnalysis } | UnsuccessfulOutcome;

export type QueryOutcome =
	{ readonly status: 'ready'; readonly result: QueryResult } | UnsuccessfulOutcome;

export interface AnalysisResponse {
	readonly requestId: string;
	readonly outcome: AnalysisOutcome;
}

export interface QueryResponse {
	readonly requestId: string;
	readonly outcome: QueryOutcome;
}

export interface QueryProgress {
	readonly phase: 'resolving-module' | 'loading-packages' | 'indexing' | 'querying' | 'filtering';
	readonly completed?: number;
	readonly total?: number;
}

export interface ImplementationAnalyzer {
	analyze(
		input: AnalysisInput,
		signal: AbortSignal,
		onProgress?: (progress: QueryProgress) => void,
	): Promise<AnalysisResponse>;
	close(): Promise<void>;
}

export interface ImplementationQueryService {
	query(
		request: QueryRequest,
		signal: AbortSignal,
		onProgress?: (progress: QueryProgress) => void,
	): Promise<QueryResponse>;
	invalidate(moduleGoModUri: string): void;
}
