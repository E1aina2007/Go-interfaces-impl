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
			// Keep embedded-method candidates and mark their origins unverified.
			// 保留嵌入方法候选并标记来源未确认
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
				// A confirmed production origin satisfies this method requirement.
				// 已确认的生产来源可满足当前方法要求
				if (sources?.retained) {
					continue;
				}
				// Exclude candidates with a confirmed test-only method origin.
				// 排除已确认仅有测试方法来源的候选
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
		// Limit method-origin queries.
		// 限制方法来源查询次数
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
			// Mark source classification incomplete when a file has syntax errors.
			// 文件存在语法错误时标记来源分类未完成
			if (file.syntax.hasErrors) {
				classified = false;
				continue;
			}
			const offset = file.document.offsetAt(location.range.start);
			const matches = (item: { start: number; end: number }): boolean =>
				item.start <= offset && offset < item.end;
			const declaration = file.syntax.methods.find(matches);
			if (!declaration) {
				// Check whether the location refers to an interface member.
				// 检查该位置是否属于接口成员
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
			// Record production and test origins for each receiver type.
			// 按接收者类型记录生产代码和测试代码中的方法来源
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
