import type { GoDeclaration } from '../core/types';
import type { LocatedType } from './model';

export interface ResolvedType {
	readonly type: LocatedType;
	// Keep pointer shape until reference validation finishes, before exposing the canonical type.
	// 在引用校验结束前保留指针形态，之后再对外提供规范类型
	readonly pointer: boolean;
}

export function sameReference(left: ResolvedType, right: ResolvedType): boolean {
	return left.type.id === right.type.id && left.pointer === right.pointer;
}

export function referenceTarget(
	declaration: Extract<GoDeclaration, { kind: 'reference' }>,
	target: ResolvedType | undefined,
): ResolvedType | undefined {
	if (!target || target.type.declaration.generic || (!declaration.alias && target.pointer)) {
		return undefined;
	}
	// A second pointer or a new defined pointer must not inherit the struct's identity.
	// 二级指针或新定义指针不能继承结构体身份
	if (
		declaration.pointer &&
		(!declaration.alias ||
			target.pointer ||
			target.type.declaration.kind !== 'struct' ||
			target.type.declaration.alias)
	) {
		return undefined;
	}
	return { type: target.type, pointer: declaration.pointer || target.pointer };
}
