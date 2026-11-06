import { CancellationError, type CancellationToken, type Location } from 'vscode';
import { GoSyntaxError, type LocatedMethod, type LocatedType, type TypeResolver } from './resolve';

const referenceLimit = 64;
const depthLimit = 32;

export interface InterfaceMethodSet {
	readonly methods: readonly LocatedMethod[];
	readonly unresolved: boolean;
}

export class InterfaceMethods {
	private readonly resolved = new Map<string, InterfaceMethodSet>();
	// Share the reference budget across all candidates in this query, including incomplete expansions.
	// 当前查询的所有候选共用引用预算，未完整展开的分支也计入其中
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
		// Cycles and unsupported targets leave requirements unknown, rather than proving an empty method set.
		// 循环和不支持的目标表示要求尚未确认，不能据此断定方法集为空
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
		// Track the current path so a shared ancestor in a diamond is not mistaken for a cycle.
		// 只记录当前路径，避免将菱形嵌入中共用的上层接口误判为循环
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
			// Deduplicate declaration identities, never method names or displayed signatures.
			// 按声明身份去重，不使用方法名或展示签名判断同一个方法
			for (const method of embedded.methods) {
				methods.set(method.id, method);
			}
		}
		const result = { methods: [...methods.values()], unresolved };
		// Partial expansion depends on the current path and remaining budget; do not cache it as complete.
		// 部分展开依赖当前路径和剩余预算，不能将其作为完整结果缓存
		if (!unresolved) {
			this.resolved.set(type.id, result);
		}
		return result;
	}

	private async target(reference: Location): Promise<LocatedType | undefined> {
		try {
			return await this.types.resolveReference(reference);
		} catch (error) {
			// An embedded interface in a file being edited stays an unknown requirement.
			// 正在编辑的文件中的嵌入接口保留为未知要求
			if (error instanceof GoSyntaxError) {
				return undefined;
			}
			throw error;
		}
	}
}
