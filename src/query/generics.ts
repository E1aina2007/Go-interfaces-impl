import { Location, type CancellationToken, type Uri } from 'vscode';
import type { GoType } from '../core/types';
import type { GoProvider } from '../language/provider';
import { InterfaceMethods } from './interfaces';
import { GoSyntaxError, type CapturedFile, type LocatedMethod, type LocatedType } from './model';
import type { TypeResolver } from './resolve';

const methodQueryLimit = 32;
const methodLocationLimit = 256;

export function supportsType(type: GoType): boolean {
	return (
		!type.constraint &&
		!type.empty &&
		(!type.generic || (type.kind === 'struct' && !type.embedded && !type.alias))
	);
}

export class GenericRelations {
	private readonly interfaces: InterfaceMethods;
	private readonly methods = new Map<string, ReadonlyMap<string, boolean>>();
	private requested = 0;
	private inspected = 0;

	constructor(
		private readonly provider: GoProvider,
		private readonly resolver: TypeResolver,
		private readonly read: (uri: Uri) => Promise<CapturedFile>,
		private readonly belongs: (uri: string) => Promise<boolean>,
		private readonly token: CancellationToken,
		private readonly check: () => void,
	) {
		this.interfaces = new InterfaceMethods(resolver, token);
	}

	async supports(subject: LocatedType, candidate: LocatedType): Promise<boolean> {
		const concrete = subject.declaration.kind === 'interface' ? candidate : subject;
		if (!concrete.declaration.generic) return true;
		const iface = subject.declaration.kind === 'interface' ? subject : candidate;
		const requirements = await this.interfaces.collect(iface);
		if (requirements.unresolved || requirements.methods.length === 0) return false;
		for (const method of requirements.methods) {
			this.check();
			const owners = await this.owners(method);
			if (owners?.get(concrete.id) !== true) return false;
		}
		return true;
	}

	private async owners(method: LocatedMethod): Promise<ReadonlyMap<string, boolean> | undefined> {
		const cached = this.methods.get(method.id);
		if (cached) return cached;
		// Bound the extra evidence lookup independently of test-source filtering.
		// 独立限制泛型证据查询，不由测试来源过滤开关决定
		if (this.requested >= methodQueryLimit) return undefined;
		this.requested++;
		const owners = new Map<string, boolean>();
		const locations = await this.provider.implementations(
			method.location.uri,
			method.location.range.start,
			this.token,
		);
		for (const location of locations) {
			this.check();
			if (location.uri.scheme !== 'file' || !(await this.belongs(location.uri.toString())))
				continue;
			if (this.inspected >= methodLocationLimit) return undefined;
			this.inspected++;
			const file = await this.read(location.uri);
			if (file.syntax.hasErrors) continue;
			const offset = file.document.offsetAt(location.range.start);
			const declaration = file.syntax.methods.find(
				(item) => item.start <= offset && offset < item.end,
			);
			if (!declaration || declaration.name !== method.name) continue;
			let owner: LocatedType | undefined;
			try {
				owner = await this.resolver.resolveReference(
					new Location(location.uri, file.document.positionAt(declaration.receiver)),
				);
			} catch (error) {
				if (error instanceof GoSyntaxError) continue;
				throw error;
			}
			if (!owner || !owner.declaration.generic || !supportsType(owner.declaration)) continue;
			// Confirm only direct, parameter-independent methods reported by the provider.
			// 仅确认 provider 返回的直接方法且签名不依赖类型参数
			const safe = declaration.generic && declaration.signatureUsesTypeParameters === false;
			owners.set(owner.id, safe && owners.get(owner.id) !== false);
		}
		this.check();
		this.methods.set(method.id, owners);
		return owners;
	}
}
