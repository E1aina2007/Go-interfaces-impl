// Positions use the same zero-based UTF-16 coordinates as the VS Code API.
// 位置使用与 VS Code API 一致的从零开始的行号和 UTF-16 列号
export interface SourcePosition {
	readonly line: number;
	readonly character: number;
}

export interface SourceRange {
	readonly start: SourcePosition;
	readonly end: SourcePosition;
}

export interface SourceLocation {
	readonly uri: string;
	readonly range: SourceRange;
}

export interface GoModule {
	readonly goModUri: string;
	readonly rootUri: string;
	readonly modulePath: string;
}

export interface BuildContext {
	readonly key: string;
	readonly goVersion: string;
	readonly goos: string;
	readonly goarch: string;
	readonly cgoEnabled: boolean;
	readonly buildFlags: readonly string[];
	readonly goWorkUri: string | null;
}

export interface AnalysisSnapshot {
	readonly id: string;
	readonly generation: number;
	readonly module: GoModule;
	readonly build: BuildContext;
}

export interface TypeAlias {
	readonly name: string;
	readonly location: SourceLocation;
}

// Type IDs belong to one snapshot; displayed type arguments must not be used for semantic equality.
// 类型标识仅在当前快照内有效，展示用的类型参数文本不能用于判断语义上的类型相等
export interface TypeDeclaration {
	readonly id: string;
	readonly name: string;
	readonly packagePath: string;
	readonly moduleGoModUri: string | null;
	readonly location: SourceLocation;
	readonly aliases: readonly TypeAlias[];
	readonly typeArguments: readonly string[];
}

export interface StructType extends TypeDeclaration {
	readonly kind: 'struct';
}

export interface InterfaceType extends TypeDeclaration {
	readonly kind: 'interface';
	readonly isEmpty: boolean;
}

export type QuerySubject = StructType | InterfaceType;
export type StructForm = 'value' | 'pointer';
export type QueryDirection = 'interfaces' | 'structs';

export interface SourceFileFacts {
	readonly uri: string;
	readonly isTestFile: boolean;
	readonly importsTesting: boolean;
}

// Keep each form and package variant separate so filtering cannot erase valid production evidence.
// 分别保留结构体形式与包变体的依据，避免过滤测试来源时删掉有效的生产代码关系
export interface ImplementationEvidence {
	readonly form: StructForm;
	readonly packageVariantId: string;
	readonly forTest: string | null;
	readonly sourceFiles: readonly SourceFileFacts[];
}

export interface ImplementationRelation {
	readonly structType: StructType;
	readonly interfaceType: InterfaceType;
	readonly evidence: readonly ImplementationEvidence[];
}

export interface AnalysisIssue {
	readonly code:
		'package-error' | 'unsupported-type' | 'incompatible-package-variant' | 'analysis-limit';
	readonly message: string;
	readonly location?: SourceLocation;
}

export type AnalysisCoverage =
	| { readonly kind: 'complete' }
	| { readonly kind: 'partial'; readonly issues: readonly AnalysisIssue[] };

export interface QueryAnalysis {
	readonly snapshot: AnalysisSnapshot;
	readonly subject: QuerySubject;
	readonly direction: QueryDirection;
	readonly relations: readonly ImplementationRelation[];
	readonly coverage: AnalysisCoverage;
}

export interface QueryResult extends QueryAnalysis {
	readonly matchedBeforeFilter: number;
	readonly hiddenByTestingFilter: number;
}
