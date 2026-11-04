import { CancellationError, Location, type CancellationToken, type Uri } from 'vscode';
import type { GoProvider } from '../language/provider';
import type { CapturedFile, LocatedMethod, LocatedType, TypeResolver } from './resolve';

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

	constructor(
		private readonly provider: GoProvider,
		private readonly resolver: TypeResolver,
		private readonly read: (uri: Uri) => Promise<CapturedFile>,
		private readonly belongs: (uri: string) => Promise<boolean>,
		private readonly token: CancellationToken,
	) {}

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
			const struct = subject.declaration.kind === 'struct' ? subject : candidate;
			const iface = subject.declaration.kind === 'interface' ? subject : candidate;
			// A production promoted method may remain valid when a test variant adds a direct method.
			// 测试变体新增直接方法时，生产代码中的提升方法仍可能成立
			if (struct.declaration.embedded) {
				matches.push(candidate);
				unverified.add(candidate.id);
				continue;
			}
			let uncertain = iface.declaration.embedded || iface.methods.length === 0;
			let exclude = false;
			for (const method of iface.methods) {
				const origins = await this.origins(method);
				const sources = origins?.owners.get(struct.id);
				if (!origins?.classified || !sources) {
					uncertain = true;
					continue;
				}
				if (sources.filtered && !sources.retained) {
					exclude = true;
					break;
				}
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

	private async origins(method: LocatedMethod): Promise<MethodOrigins | undefined> {
		this.check();
		const { uri, range } = method.location;
		const key = `${uri.toString()}:${range.start.line}:${range.start.character}`;
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
			if (file.syntax.hasErrors) {
				throw new Error(`Fix Go syntax errors in ${location.uri.fsPath} before querying.`);
			}
			const offset = file.document.offsetAt(location.range.start);
			const matches = (item: { start: number; end: number }): boolean =>
				item.start <= offset && offset < item.end;
			const declaration = file.syntax.methods.find(matches);
			if (!declaration) {
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
			const owner = await this.resolver.resolveReference(
				new Location(location.uri, file.document.positionAt(declaration.receiver)),
			);
			if (!owner || owner.declaration.kind !== 'struct' || owner.declaration.generic) {
				classified = false;
				continue;
			}
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
