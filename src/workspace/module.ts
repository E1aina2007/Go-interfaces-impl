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

export function isMissingPath(error: unknown): boolean {
	return (
		error instanceof Error &&
		'code' in error &&
		(error.code === 'ENOENT' || error.code === 'ENOTDIR')
	);
}
