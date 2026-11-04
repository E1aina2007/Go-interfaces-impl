import {
	CancellationError,
	Location,
	Range,
	type CancellationToken,
	type TextDocument,
	type Uri,
} from 'vscode';
import type { GoFile, GoType } from '../core/types';
import type { GoProvider } from '../language/provider';
import { canonicalUri, fileKey } from '../workspace/module';

export interface CapturedFile {
	readonly document: TextDocument;
	readonly version: number;
	readonly syntax: GoFile;
}

export interface LocatedType {
	readonly id: string;
	readonly declaration: GoType;
	readonly location: Location;
	readonly testing: boolean;
	readonly methods: readonly LocatedMethod[];
}

export interface LocatedMethod {
	readonly name: string;
	readonly location: Location;
}

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
			throw new Error(`Fix Go syntax errors in ${location.uri.fsPath} before querying.`);
		}
		const offset = file.document.offsetAt(location.range.start);
		const declaration = file.syntax.declarations.find(
			(item) => item.start <= offset && offset < item.end,
		);
		if (!declaration || declaration.kind === 'unsupported') {
			return undefined;
		}
		const id = `${fileKey(await canonicalUri(location.uri.toString()))}:${declaration.start}`;
		if (visited.has(id) || visited.size >= 32) {
			return undefined;
		}
		const cached = this.resolved.get(id);
		if (cached) {
			return cached;
		}
		let type: GoType;
		let methods: readonly LocatedMethod[];
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
			if (!target) {
				return undefined;
			}
			// Aliases share their target identity; a type definition keeps its own methods and identity.
			// 别名与目标共享身份，类型定义保留自身身份并由语言服务判断自身方法集
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
			methods = target.methods;
		} else {
			type = declaration;
			methods = file.syntax.interfaceMethods
				.filter((item) => item.owner === declaration.start)
				.map((item) => ({
					name: item.name,
					location: new Location(
						location.uri,
						new Range(
							file.document.positionAt(item.start),
							file.document.positionAt(item.end),
						),
					),
				}));
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
		};
		this.resolved.set(id, result);
		return result;
	}
}
