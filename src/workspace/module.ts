import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface GoModule {
	readonly goModUri: string;
	readonly rootUri: string;
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
	let directory = path.dirname(fileURLToPath(await canonicalUri(uri)));
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
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
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
	const canonical = await canonicalUri(uri);
	const relative = path.relative(fileURLToPath(module.rootUri), fileURLToPath(canonical));
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		return false;
	}
	// The nearest go.mod also excludes nested modules and vendored source trees.
	// 同时核对最近的 go.mod，排除嵌套模块与 vendor 目录中的源码
	if (relative.split(path.sep).includes('vendor')) {
		return false;
	}
	const owner = await findModule(canonical);
	return owner !== undefined && fileKey(owner.goModUri) === fileKey(module.goModUri);
}
