import { CancellationError, Location, Range, type CancellationToken, type Uri } from 'vscode';
import type { GoType } from '../core/types';
import type { GoProvider } from '../language/provider';
import { canonicalUri, fileKey } from '../workspace/module';
import { GoSyntaxError, type CapturedFile, type LocatedMethod, type LocatedType } from './model';

export class TypeResolver {
	private readonly resolved = new Map<string, LocatedType>();

	constructor(
		private readonly provider: GoProvider,
		private readonly read: (uri: Uri) => Promise<CapturedFile>,
		private readonly token: CancellationToken,
	) {}

	resolve(location: Location): Promise<LocatedType | undefined> {
		return this.follow(location, new Set());
	}

	async resolveReference(location: Location): Promise<LocatedType | undefined> {
		const file = await this.read(location.uri);
		const offset = file.document.offsetAt(location.range.start);
		if (file.syntax.declarations.some((item) => item.start <= offset && offset < item.end)) {
			return this.resolve(location);
		}
		let result: LocatedType | undefined;
		// Merge definitions only when they resolve to the same canonical type.
		// 仅合并解析到同一规范类型的定义
		for (const definition of await this.provider.definitions(
			location.uri,
			location.range.start,
			this.token,
		)) {
			const candidate = await this.resolve(definition);
			if (!candidate || (result && result.id !== candidate.id)) {
				return undefined;
			}
			result = candidate;
		}
		return result;
	}

	private async follow(
		location: Location,
		visited: ReadonlySet<string>,
	): Promise<LocatedType | undefined> {
		if (this.token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (location.uri.scheme !== 'file' || !location.uri.path.endsWith('.go')) {
			return undefined;
		}
		const file = await this.read(location.uri);
		if (file.syntax.hasErrors) {
			throw new GoSyntaxError(location.uri);
		}
		const offset = file.document.offsetAt(location.range.start);
		let declaration = file.syntax.declarations.find(
			(item) => item.start <= offset && offset < item.end,
		);
		// Resolve predeclared types through builtin.go.
		// 通过 builtin.go 解析预声明类型
		if (
			declaration?.kind === 'reference' &&
			/\/src\/builtin\/builtin\.go$/i.test(location.uri.path) &&
			/^(bool|complex64|complex128|float32|float64|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|string)$/.test(
				declaration.name,
			) &&
			file.document.getText(
				new Range(
					file.document.positionAt(declaration.target),
					file.document.positionAt(declaration.target + declaration.name.length),
				),
			) === declaration.name
		) {
			declaration = {
				...declaration,
				kind: 'basic',
				empty: false,
				constraint: false,
				embedded: false,
			};
		}
		if (!declaration || declaration.kind === 'unsupported') {
			return undefined;
		}
		// Identify types by canonical file path and declaration offset.
		// 使用规范文件路径和声明偏移量标识类型
		const fileId = fileKey(await canonicalUri(location.uri.toString()));
		const id = `${fileId}:${declaration.start}`;
		if (visited.has(id) || visited.size >= 32) {
			return undefined;
		}
		const cached = this.resolved.get(id);
		if (cached) {
			return cached;
		}
		let type: GoType;
		let methods: readonly LocatedMethod[];
		let interfaces: readonly (Location | null)[];
		if (declaration.kind === 'reference') {
			if (declaration.generic) {
				return undefined;
			}
			const next = new Set(visited);
			next.add(id);
			const definitions = await this.provider.definitions(
				location.uri,
				file.document.positionAt(declaration.target),
				this.token,
			);
			let target: LocatedType | undefined;
			for (const definition of definitions) {
				const candidate = await this.follow(definition, next);
				if (!candidate || (target && target.id !== candidate.id)) {
					return undefined;
				}
				target = candidate;
			}
			// Generic aliases and defined references need instance-aware identities.
			// 泛型别名和新定义引用需要能区分实例的身份
			if (!target || target.declaration.generic) {
				return undefined;
			}
			// Resolve aliases to their target type.
			// 将别名解析为目标类型
			if (declaration.alias) {
				this.resolved.set(id, target);
				return target;
			}
			type = {
				name: declaration.name,
				start: declaration.start,
				end: declaration.end,
				alias: false,
				generic: target.declaration.generic,
				kind: target.declaration.kind,
				empty: target.declaration.empty,
				constraint: target.declaration.constraint,
				embedded: target.declaration.embedded,
			};
			// Use the target's methods and interfaces for this reference.
			// 使用该引用目标的方法和接口
			methods = target.methods;
			interfaces = target.interfaces;
		} else {
			type = declaration;
			methods = file.syntax.interfaceMethods
				.filter((item) => item.owner === declaration.start)
				.map((item) => ({
					id: `${fileId}:${item.start}`,
					name: item.name,
					location: new Location(
						location.uri,
						new Range(
							file.document.positionAt(item.start),
							file.document.positionAt(item.end),
						),
					),
				}));
			interfaces = file.syntax.interfaceEmbeddings
				.filter((item) => item.owner === declaration.start)
				.map((item) =>
					item.target === null
						? null
						: new Location(location.uri, file.document.positionAt(item.target)),
				);
		}
		const result = {
			id,
			declaration: type,
			location: new Location(
				location.uri,
				new Range(
					file.document.positionAt(declaration.start),
					file.document.positionAt(declaration.end),
				),
			),
			testing: location.uri.path.endsWith('_test.go') && file.syntax.importsTesting,
			methods,
			interfaces,
		};
		this.resolved.set(id, result);
		return result;
	}
}
