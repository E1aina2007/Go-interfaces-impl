export type TypeKind = 'struct' | 'interface';

export interface GoDeclaration {
	readonly name: string;
	readonly kind: TypeKind;
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
