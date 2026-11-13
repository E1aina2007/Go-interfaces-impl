export type TypeKind =
	'struct' | 'interface' | 'function' | 'basic' | 'array' | 'slice' | 'map' | 'channel';

export interface GoIdentifier {
	readonly name: string;
	// Web Tree-sitter and VS Code both use UTF-16 offsets.
	// Web Tree-sitter 与 VS Code 均使用 UTF-16 偏移量
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
	// A null target marks an unresolved interface requirement.
	// null 目标表示接口要求尚未解析
	readonly target: number | null;
}

export interface GoMethod extends GoIdentifier {
	readonly receiver: number;
	readonly generic: boolean;
	readonly receiverTypeParameters: readonly string[] | undefined;
	// Undefined means the receiver or signature could not be classified safely.
	// undefined 表示无法可靠分类接收者或方法签名
	readonly signatureUsesTypeParameters: boolean | undefined;
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
