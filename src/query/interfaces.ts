import { CancellationError, type CancellationToken, type Location } from 'vscode';
import { GoSyntaxError, type LocatedMethod, type LocatedType } from './model';
import type { TypeResolver } from './resolve';

const referenceLimit = 64;
const depthLimit = 32;

export interface InterfaceMethodSet {
	readonly methods: readonly LocatedMethod[];
	readonly unresolved: boolean;
}

export class InterfaceMethods {
	private readonly resolved = new Map<string, InterfaceMethodSet>();
	// Count references against one query-wide budget.
	// 所有引用共用当前查询的预算
	private requested = 0;

	constructor(
		private readonly types: TypeResolver,
		private readonly token: CancellationToken,
	) {}

	collect(type: LocatedType): Promise<InterfaceMethodSet> {
		return this.expand(type, new Set());
	}

	private async expand(
		type: LocatedType,
		visited: ReadonlySet<string>,
	): Promise<InterfaceMethodSet> {
		if (this.token.isCancellationRequested) {
			throw new CancellationError();
		}
		// Mark cyclic or unsupported expansions as unresolved.
		// 将循环或不支持的展开标记为未解析
		if (
			type.declaration.kind !== 'interface' ||
			type.declaration.generic ||
			type.declaration.constraint ||
			visited.has(type.id) ||
			visited.size >= depthLimit
		) {
			return { methods: [], unresolved: true };
		}
		const cached = this.resolved.get(type.id);
		if (cached) {
			return cached;
		}
		// Track interface IDs on the current recursion path.
		// 记录当前递归路径上的接口 ID
		const next = new Set(visited);
		next.add(type.id);
		const methods = new Map<string, LocatedMethod>();
		for (const method of type.methods) {
			methods.set(method.id, method);
		}
		let unresolved = false;
		for (const reference of type.interfaces) {
			if (this.token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (!reference || this.requested >= referenceLimit) {
				unresolved = true;
				continue;
			}
			this.requested++;
			const target = await this.target(reference);
			if (!target) {
				unresolved = true;
				continue;
			}
			const embedded = await this.expand(target, next);
			unresolved ||= embedded.unresolved;
			// Deduplicate methods by declaration identity.
			// 按声明身份去重方法
			for (const method of embedded.methods) {
				methods.set(method.id, method);
			}
		}
		const result = { methods: [...methods.values()], unresolved };
		// Cache only complete interface method sets.
		// 只缓存完整的接口方法集
		if (!unresolved) {
			this.resolved.set(type.id, result);
		}
		return result;
	}

	private async target(reference: Location): Promise<LocatedType | undefined> {
		try {
			return await this.types.resolveReference(reference);
		} catch (error) {
			// Keep requirements unresolved when an embedded interface has syntax errors.
			// 嵌入接口存在语法错误时保留为未解析状态
			if (error instanceof GoSyntaxError) {
				return undefined;
			}
			throw error;
		}
	}
}
