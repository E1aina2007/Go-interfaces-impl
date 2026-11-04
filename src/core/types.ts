export type TypeKind = 'struct' | 'interface';

export interface GoDeclaration {
	readonly name: string;
	readonly kind: TypeKind;
	// Web Tree-sitter exposes UTF-16 string offsets, matching VS Code document offsets.
	// Web Tree-sitter 提供 UTF-16 字符串偏移量，与 VS Code 文档偏移量一致
	readonly start: number;
	readonly end: number;
	readonly generic: boolean;
	readonly empty: boolean;
	readonly constraint: boolean;
}

export interface GoFile {
	readonly declarations: readonly GoDeclaration[];
	readonly importsTesting: boolean;
	readonly hasErrors: boolean;
}
