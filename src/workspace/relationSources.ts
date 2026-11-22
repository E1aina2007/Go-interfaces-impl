import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalDependencies, type LocalDependencies } from './localDependencies';
import { fileKey, findModuleFromDirectory, isMissingPath, type GoModule } from './module';

export const relationSourceKinds = ['module', 'standard', 'dependency'] as const;
export type RelationSourceKind = (typeof relationSourceKinds)[number];
export type RelationScope = 'module' | 'all';

export interface RelationSource {
	readonly kind: RelationSourceKind;
	readonly importPath: string | undefined;
	readonly version?: string | undefined;
}

function relativePath(root: string, directory: string): string {
	return path.relative(root, directory).split(path.sep).join('/');
}

function importPathOf(modulePath: string, root: string, directory: string): string {
	const relative = relativePath(root, directory);
	return relative ? `${modulePath}/${relative}` : modulePath;
}

function modulePathOf(text: string | undefined): string | undefined {
	const match = text?.match(/^[ \t]*module[ \t]+(?:"([^"\r\n]+)"|([^\s"]+))/m);
	return match?.[1] ?? match?.[2];
}

async function sourceDirectory(uri: string): Promise<string | undefined> {
	try {
		return path.dirname(await realpath(fileURLToPath(uri)));
	} catch (error) {
		if (!isMissingPath(error)) {
			throw error;
		}
		return undefined;
	}
}

async function readMetadata(filename: string): Promise<string | undefined> {
	try {
		return await readFile(filename, 'utf8');
	} catch (error) {
		if (!isMissingPath(error)) {
			throw error;
		}
		return undefined;
	}
}

async function isFile(filename: string): Promise<boolean> {
	try {
		return (await stat(filename)).isFile();
	} catch (error) {
		if (!isMissingPath(error)) {
			throw error;
		}
		return false;
	}
}

export class RelationSources {
	private readonly directories = new Map<string, Promise<string | undefined>>();
	private readonly packages = new Map<string, Promise<RelationSource | undefined>>();
	private readonly metadata = new Map<string, Promise<string | undefined>>();
	private localDependencies: Promise<LocalDependencies> | undefined;

	constructor(
		private readonly module: GoModule,
		private readonly scope: RelationScope,
		private readonly queryDirectory: string,
		private readonly goWork: string | undefined,
	) {}

	directory(uri: string): Promise<string | undefined> {
		let directory = this.directories.get(uri);
		if (!directory) {
			directory = sourceDirectory(uri);
			this.directories.set(uri, directory);
		}
		return directory;
	}

	async source(uri: string): Promise<RelationSource | undefined> {
		const directory = await this.directory(uri);
		if (directory === undefined) {
			return undefined;
		}
		let source = this.packages.get(directory);
		if (!source) {
			source = this.classify(directory);
			this.packages.set(directory, source);
		}
		return source;
	}

	private read(filename: string): Promise<string | undefined> {
		let text = this.metadata.get(filename);
		if (!text) {
			text = readMetadata(filename);
			this.metadata.set(filename, text);
		}
		return text;
	}

	private async classify(directory: string): Promise<RelationSource | undefined> {
		const moduleRoot = fileURLToPath(this.module.rootUri);
		const relative = path.relative(moduleRoot, directory);
		const insideModule =
			!path.isAbsolute(relative) &&
			relative !== '..' &&
			!relative.startsWith(`..${path.sep}`) &&
			!relative.split(path.sep).includes('vendor');
		// Automatic queries can skip external metadata before walking parent directories.
		// 自动查询在向上查找目录前跳过外部元数据
		if (this.scope === 'module' && !insideModule) {
			return undefined;
		}
		const owner = await findModuleFromDirectory(directory);
		if (
			insideModule &&
			owner &&
			fileKey(owner.rootUri) === fileKey(this.module.rootUri) &&
			fileKey(owner.goModUri) === fileKey(this.module.goModUri)
		) {
			const modulePath = modulePathOf(await this.read(fileURLToPath(owner.goModUri)));
			return {
				kind: 'module',
				importPath: modulePath && importPathOf(modulePath, moduleRoot, directory),
			};
		}
		if (this.scope === 'module') {
			return undefined;
		}
		const root = owner && fileURLToPath(owner.rootUri);
		const modulePath = owner && modulePathOf(await this.read(fileURLToPath(owner.goModUri)));
		// SDKs downloaded as modules still provide standard-library packages.
		// 以 module 形式下载的 SDK 仍提供标准库包
		if (
			root &&
			modulePath === 'std' &&
			path.basename(root) === 'src' &&
			(await isFile(path.join(root, 'builtin', 'builtin.go')))
		) {
			return { kind: 'standard', importPath: relativePath(root, directory) };
		}
		// A local replacement keeps the required module's import path.
		// 本地替换保留被依赖的 module 导入路径
		let required = false;
		if (owner && root && !relativePath(root, directory).split('/').includes('vendor')) {
			this.localDependencies ??= readLocalDependencies(
				this.module,
				this.queryDirectory,
				this.goWork,
				(filename) => this.read(filename),
			);
			const dependencies = await this.localDependencies;
			const replacement = dependencies.replacements.get(fileKey(owner.rootUri));
			if (replacement !== undefined) {
				return replacement
					? { kind: 'dependency', importPath: importPathOf(replacement, root, directory) }
					: undefined;
			}
			required = modulePath !== undefined && dependencies.required.has(modulePath);
		}
		const dependency = await this.externalSource(directory);
		if (dependency) {
			return dependency;
		}
		if (required && root && modulePath) {
			return { kind: 'dependency', importPath: importPathOf(modulePath, root, directory) };
		}
		return undefined;
	}

	private async externalSource(directory: string): Promise<RelationSource | undefined> {
		for (let root = directory; root !== path.dirname(root); root = path.dirname(root)) {
			const name = path.basename(root);
			if (name === 'vendor') {
				const importPath = relativePath(root, directory);
				const manifest = await this.read(path.join(root, 'modules.txt'));
				let version: string | undefined;
				for (const line of manifest?.split(/\r?\n/) ?? []) {
					if (line.startsWith('# ')) {
						const source = line.split(' => ').at(-1);
						version = source?.match(/\s(v\d\S*)$/)?.[1];
					} else if (importPath && line === importPath) {
						return { kind: 'dependency', importPath, version };
					}
				}
			}
			const version = name.match(/@(v\d+\.\d+\.\d+[^@]*)$/)?.[1];
			if (version) {
				const source = await this.cachedSource(directory, root, version);
				if (source) {
					return source;
				}
			}
		}
		return undefined;
	}

	private async cachedSource(
		directory: string,
		root: string,
		version: string,
	): Promise<RelationSource | undefined> {
		// Verify the module cache layout using the matching proxy metadata.
		// 用对应的代理元数据确认 Go module 缓存目录
		for (let cache = path.dirname(root); ; cache = path.dirname(cache)) {
			const encodedPath = path.relative(cache, root).slice(0, -version.length - 1);
			const metadata = await this.read(
				path.join(cache, 'cache', 'download', encodedPath, '@v', `${version}.mod`),
			);
			const modulePath = modulePathOf(metadata);
			if (modulePath) {
				return {
					kind: 'dependency',
					importPath: importPathOf(modulePath, root, directory),
					version: version.replace(/!([a-z])/g, (_, c: string) => c.toUpperCase()),
				};
			}
			if (cache === path.dirname(cache)) {
				return undefined;
			}
		}
	}
}
