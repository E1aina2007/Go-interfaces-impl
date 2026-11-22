import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface GoModule {
	readonly goModUri: string;
	readonly rootUri: string;
}

export function isGoConfigFile(filename: string): boolean {
	return /^go\.(mod|sum|work|work\.sum)$/.test(path.basename(filename));
}

export function fileKey(uri: string): string {
	const filename = fileURLToPath(uri);
	return process.platform === 'win32' ? filename.toLowerCase() : filename;
}

export async function canonicalUri(uri: string): Promise<string> {
	let filename = fileURLToPath(uri);
	const missing: string[] = [];
	for (;;) {
		try {
			const resolved = await realpath(filename);
			return pathToFileURL(path.join(resolved, ...missing.reverse())).href;
		} catch (error) {
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
				throw error;
			}
			const parent = path.dirname(filename);
			if (parent === filename) {
				throw error;
			}
			missing.push(path.basename(filename));
			filename = parent;
		}
	}
}

export async function findModule(uri: string): Promise<GoModule | undefined> {
	return findModuleFromDirectory(path.dirname(fileURLToPath(await canonicalUri(uri))));
}

export async function findModuleFromDirectory(directory: string): Promise<GoModule | undefined> {
	for (;;) {
		const filename = path.join(directory, 'go.mod');
		try {
			if ((await stat(filename)).isFile()) {
				return {
					goModUri: await canonicalUri(pathToFileURL(filename).href),
					rootUri: pathToFileURL(directory).href,
				};
			}
		} catch (error) {
			if (!isMissingPath(error)) {
				throw error;
			}
		}
		const parent = path.dirname(directory);
		if (parent === directory) {
			return undefined;
		}
		directory = parent;
	}
}

export async function belongsToModule(uri: string, module: GoModule): Promise<boolean> {
	let filename: string;
	try {
		filename = await realpath(fileURLToPath(uri));
	} catch (error) {
		// The provider can still return locations from a deleted file held open by VS Code.
		// VS Code 仍持有已删除文件时，语言服务可能继续返回该文件的位置
		if (
			error instanceof Error &&
			'code' in error &&
			(error.code === 'ENOENT' || error.code === 'ENOTDIR')
		) {
			return false;
		}
		throw error;
	}
	const relative = path.relative(fileURLToPath(module.rootUri), filename);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		return false;
	}
	// Check module ownership and exclude vendor source files.
	// 核对模块归属并排除 vendor 源码
	if (relative.split(path.sep).includes('vendor')) {
		return false;
	}
	const owner = await findModule(pathToFileURL(filename).href);
	return owner !== undefined && fileKey(owner.goModUri) === fileKey(module.goModUri);
export function isMissingPath(error: unknown): boolean {
	return (
		error instanceof Error &&
		'code' in error &&
		(error.code === 'ENOENT' || error.code === 'ENOTDIR')
	);
}
