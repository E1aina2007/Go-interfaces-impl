export type TypeKind =
	'struct' | 'interface' | 'function' | 'basic' | 'array' | 'slice' | 'map' | 'channel';

export interface GoIdentifier {
	readonly name: string;
	// Web Tree-sitter exposes UTF-16 string offsets, matching VS Code document offsets.
	// Web Tree-sitter 提供 UTF-16 字符串偏移量，与 VS Code 文档偏移量一致
	readonly start: number;
	readonly end: number;
}

interface GoTypeName extends GoIdentifier {
	readonly generic: boolean;
	readonly alias: boolean;
}

export interface GoType extends GoTypeName {
	readonly kind: TypeKind;
	readonly empty: boolean;
	readonly constraint: boolean;
	readonly embedded: boolean;
}

export interface GoInterfaceMethod extends GoIdentifier {
	readonly owner: number;
}

export interface GoInterfaceEmbedding {
	readonly owner: number;
	// A null target preserves an unsupported requirement instead of implying that none exists.
	// null 目标保留无法解析的要求，不能将其视为没有要求
	readonly target: number | null;
}

export interface GoMethod extends GoIdentifier {
	readonly receiver: number;
	readonly generic: boolean;
}

interface GoTypeReference extends GoTypeName {
	readonly kind: 'reference';
	readonly target: number;
}

interface UnsupportedGoType extends GoTypeName {
	readonly kind: 'unsupported';
}

export type GoDeclaration = GoType | GoTypeReference | UnsupportedGoType;

export interface GoFile {
	readonly declarations: readonly GoDeclaration[];
	readonly interfaceMethods: readonly GoInterfaceMethod[];
	readonly interfaceEmbeddings: readonly GoInterfaceEmbedding[];
	readonly methods: readonly GoMethod[];
	readonly importsTesting: boolean;
	readonly hasErrors: boolean;
}
