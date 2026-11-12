import { CancellationError, Location, type CancellationToken, type Uri } from 'vscode';
import type { GoProvider } from '../language/provider';
import { GoSyntaxError, type CapturedFile, type LocatedMethod, type LocatedType } from './model';
import type { TypeResolver } from './resolve';
import { InterfaceMethods } from './interfaces';

const methodQueryLimit = 32;
const methodLocationLimit = 256;

interface MethodSources {
	filtered: boolean;
	retained: boolean;
}

interface MethodOrigins {
	readonly owners: ReadonlyMap<string, MethodSources>;
	readonly classified: boolean;
}

export interface TestingFilterResult {
	readonly matches: readonly LocatedType[];
	readonly hidden: number;
	readonly unverified: ReadonlySet<string>;
}

export class TestingFilter {
	private readonly methods = new Map<string, MethodOrigins>();
	private requested = 0;
	private inspected = 0;
	private readonly interfaces: InterfaceMethods;

	constructor(
		private readonly provider: GoProvider,
		private readonly resolver: TypeResolver,
		private readonly read: (uri: Uri) => Promise<CapturedFile>,
		private readonly belongs: (uri: string) => Promise<boolean>,
		private readonly token: CancellationToken,
	) {
		this.interfaces = new InterfaceMethods(resolver, token);
	}

	async apply(
		subject: LocatedType,
		candidates: readonly LocatedType[],
	): Promise<TestingFilterResult> {
		const matches: LocatedType[] = [];
		let hidden = 0;
		const unverified = new Set<string>();
		for (const candidate of candidates) {
			this.check();
			if (subject.testing || candidate.testing) {
				hidden++;
				continue;
			}
			const concrete = subject.declaration.kind !== 'interface' ? subject : candidate;
			const iface = subject.declaration.kind === 'interface' ? subject : candidate;
			// A production promoted method may remain valid when a test variant adds a direct method.
			// 测试变体新增直接方法时，生产代码中的提升方法仍可能成立
			if (concrete.declaration.embedded) {
				matches.push(candidate);
				unverified.add(candidate.id);
				continue;
			}
			const requirements = await this.interfaces.collect(iface);
			let uncertain = requirements.unresolved || requirements.methods.length === 0;
			let exclude = false;
			for (const method of requirements.methods) {
				const origins = await this.origins(method);
				const sources = origins?.owners.get(concrete.id);
				// A retained source proves this method can stay despite other unresolved receivers.
				// 已确认的可保留来源足以保留该方法，不受其他接收者未解析的影响
				if (sources?.retained) {
					continue;
				}
				// A known required method can justify exclusion even when other requirements remain unresolved.
				// 已确认的必要方法可作为过滤依据，即使其他要求仍未解析完成
				if (origins?.classified && sources?.filtered) {
					exclude = true;
					break;
				}
				uncertain = true;
			}
			if (exclude) {
				hidden++;
				continue;
			}
			matches.push(candidate);
			if (uncertain) {
				unverified.add(candidate.id);
			}
		}
		return { matches, hidden, unverified };
	}

	private check(): void {
		if (this.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	private async receiver(location: Location): Promise<LocatedType | undefined> {
		try {
			return await this.resolver.resolveReference(location);
		} catch (error) {
			if (error instanceof GoSyntaxError) {
				return undefined;
			}
			throw error;
		}
	}

	private async origins(method: LocatedMethod): Promise<MethodOrigins | undefined> {
		this.check();
		const { uri, range } = method.location;
		const key = method.id;
		const cached = this.methods.get(key);
		if (cached) {
			return cached;
		}
		// Bound language-service work; an exhausted budget keeps results and reports unknown origins.
		// 限制语言服务工作量，预算耗尽时保留结果并标记来源未确认
		if (this.requested >= methodQueryLimit) {
			return undefined;
		}
		this.requested++;
		const owners = new Map<string, MethodSources>();
		let classified = true;
		const locations = await this.provider.implementations(uri, range.start, this.token);
		for (const location of locations) {
			this.check();
			if (location.uri.scheme !== 'file') {
				classified = false;
				continue;
			}
			if (!(await this.belongs(location.uri.toString()))) {
				continue;
			}
			if (this.inspected >= methodLocationLimit) {
				classified = false;
				break;
			}
			this.inspected++;
			const file = await this.read(location.uri);
			// An unparseable method file leaves the overall source classification incomplete.
			// 方法文件存在语法错误时，来源整体分类不完整
			if (file.syntax.hasErrors) {
				classified = false;
				continue;
			}
			const offset = file.document.offsetAt(location.range.start);
			const matches = (item: { start: number; end: number }): boolean =>
				item.start <= offset && offset < item.end;
			const declaration = file.syntax.methods.find(matches);
			if (!declaration) {
				// Interface member results describe requirements, not concrete receiver method origins.
				// 接口成员结果描述方法要求，不能作为具体接收者的方法来源
				if (!file.syntax.interfaceMethods.some(matches)) {
					classified = false;
				}
				continue;
			}
			if (declaration.generic) {
				continue;
			}
			if (declaration.name !== method.name) {
				classified = false;
				continue;
			}
			const owner = await this.receiver(
				new Location(location.uri, file.document.positionAt(declaration.receiver)),
			);
			if (!owner || owner.declaration.kind === 'interface' || owner.declaration.generic) {
				classified = false;
				continue;
			}
			// Accumulate both source kinds so a later test location cannot erase a retained source.
			// 同时累计两类来源，避免后返回的测试位置覆盖已有的可保留来源
			const sources = owners.get(owner.id) ?? { filtered: false, retained: false };
			const filtered = location.uri.path.endsWith('_test.go') && file.syntax.importsTesting;
			if (filtered) {
				sources.filtered = true;
			} else {
				sources.retained = true;
			}
			owners.set(owner.id, sources);
		}
		const result = { owners, classified };
		this.methods.set(key, result);
		return result;
	}
}
