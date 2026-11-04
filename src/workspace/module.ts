import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import * as z from 'zod/mini';
import type { QueryFailure, UnsuccessfulOutcome } from '../application/contracts';
import type { BuildContext, GoModule } from '../domain/types';

const execute = promisify(execFile);
const environmentSchema = z.catchall(
	z.object({
		GOMOD: z.string(),
		GOWORK: z.optional(z.string()),
		GOVERSION: z.string(),
		GOOS: z.string(),
		GOARCH: z.string(),
		CGO_ENABLED: z.enum(['0', '1']),
	}),
	z.string(),
);
const replacementSchema = z.object({
	New: z.object({ Path: z.string(), Version: z.optional(z.string()) }),
});
const moduleSchema = z.object({
	Module: z.object({ Path: z.string().check(z.minLength(1)) }),
	Replace: z.optional(z.nullable(z.array(replacementSchema))),
});
const workSchema = z.object({
	Use: z.optional(z.nullable(z.array(z.object({ DiskPath: z.string() })))),
	Replace: z.optional(z.nullable(z.array(replacementSchema))),
});

export class WorkspaceError extends Error {
	constructor(readonly outcome: UnsuccessfulOutcome) {
		super(outcome.status === 'failed' ? outcome.error.message : outcome.status);
		this.name = 'WorkspaceError';
	}
}

export interface ModuleOptions {
	readonly goExecutable?: string;
	readonly buildFlags?: readonly string[];
	readonly environment?: NodeJS.ProcessEnv;
	readonly unsavedConfigurationUris?: readonly string[];
}

export interface ModuleContext {
	readonly sourceUri: string;
	readonly module: GoModule;
	readonly build: BuildContext;
	readonly goExecutable: string;
	readonly environment: Readonly<NodeJS.ProcessEnv>;
	readonly configurationUris: readonly string[];
	readonly configurationDigest: string;
}

function failure(code: QueryFailure['code'], message: string): WorkspaceError {
	return new WorkspaceError({ status: 'failed', error: { code, message } });
}

function checkCancelled(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new WorkspaceError({ status: 'cancelled' });
	}
}

export function fileKey(uri: string): string {
	return process.platform === 'win32' ? uri.toLowerCase() : uri;
}

// Resolve existing parents too, so a new unsaved file can share the module's canonical path.
// 同时解析已存在的父目录，让尚未保存的新文件也能使用模块的规范路径
export async function canonicalFileUri(uri: string): Promise<string> {
	const url = new URL(uri);
	if (url.protocol !== 'file:') {
		throw new WorkspaceError({ status: 'unsupported', reason: 'virtual-workspace' });
	}
	let current = fileURLToPath(url);
	const missing: string[] = [];
	for (;;) {
		try {
			const resolved = await realpath(current);
			return pathToFileURL(path.join(resolved, ...missing)).toString();
		} catch (error) {
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
				throw error;
			}
			const parent = path.dirname(current);
			if (parent === current) {
				throw error;
			}
			missing.unshift(path.basename(current));
			current = parent;
		}
	}
}

export async function configurationDigest(uris: readonly string[]): Promise<string> {
	const hash = createHash('sha256');
	for (const uri of [...uris].sort()) {
		try {
			const content = createHash('sha256')
				.update(await readFile(fileURLToPath(uri)))
				.digest('hex');
			hash.update(JSON.stringify([uri, content]));
		} catch (error) {
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
				throw error;
			}
			// A missing go.sum is an input too; creating it must change the configuration identity.
			// 缺失的 go.sum 也是输入，创建该文件后必须改变配置标识
			hash.update(JSON.stringify([uri, null]));
		}
	}
	return hash.digest('hex');
}

async function nearestModule(sourceUri: string, unsaved: ReadonlySet<string>): Promise<string> {
	let directory = path.dirname(fileURLToPath(sourceUri));
	for (;;) {
		const uri = await canonicalFileUri(
			pathToFileURL(path.join(directory, 'go.mod')).toString(),
		);
		if (unsaved.has(fileKey(uri))) {
			throw new WorkspaceError({ status: 'unsupported', reason: 'unsaved-module-config' });
		}
		try {
			if ((await stat(fileURLToPath(uri))).isFile()) {
				return uri;
			}
		} catch (error) {
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
				throw error;
			}
		}
		const parent = path.dirname(directory);
		if (parent === directory) {
			throw failure('module-not-found', 'The selected Go file does not belong to a module.');
		}
		directory = parent;
	}
}

export async function resolveModule(
	source: string,
	options: ModuleOptions,
	signal: AbortSignal,
): Promise<ModuleContext> {
	checkCancelled(signal);
	const sourceUri = await canonicalFileUri(source);
	const unsaved = new Set(
		(await Promise.all((options.unsavedConfigurationUris ?? []).map(canonicalFileUri))).map(
			fileKey,
		),
	);
	const goModUri = await nearestModule(sourceUri, unsaved);
	const rootPath = path.dirname(fileURLToPath(goModUri));
	const command = z
		.string()
		.check(
			z.minLength(1),
			z.refine((value) => !value.includes('\0')),
		)
		.safeParse(options.goExecutable || 'go');
	if (!command.success) {
		throw new WorkspaceError({ status: 'unsupported', reason: 'unsupported-build-config' });
	}
	const goExecutable = command.data;
	const environment = { ...(options.environment ?? process.env) };
	const flags = z.array(z.string()).safeParse(options.buildFlags ?? []);
	if (!flags.success) {
		throw new WorkspaceError({ status: 'unsupported', reason: 'unsupported-build-config' });
	}
	const initialDigest = await configurationDigest([goModUri]);

	async function run<T>(args: string[], schema: z.ZodMiniType<T>): Promise<T> {
		checkCancelled(signal);
		let stdout: string;
		try {
			({ stdout } = await execute(goExecutable, args, {
				cwd: rootPath,
				env: environment,
				signal,
				timeout: 15_000,
				maxBuffer: 4 * 1024 * 1024,
				encoding: 'utf8',
				windowsHide: true,
			}));
		} catch (error) {
			checkCancelled(signal);
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
				throw failure('go-not-found', 'The selected Go executable could not be found.');
			}
			if (error instanceof Error && 'killed' in error && error.killed === true) {
				throw failure('timeout', 'Go module discovery exceeded its time limit.');
			}
			throw failure(
				'package-load-failed',
				error instanceof Error ? error.message : String(error),
			);
		}
		let value: unknown;
		try {
			value = JSON.parse(stdout);
		} catch {
			throw failure('protocol-error', 'Go returned invalid JSON metadata.');
		}
		const parsed = schema.safeParse(value);
		if (!parsed.success) {
			throw failure('protocol-error', 'Go returned an unsupported metadata shape.');
		}
		return parsed.data;
	}

	const goEnvironment = await run(['env', '-json'], environmentSchema);
	if (!path.isAbsolute(goEnvironment.GOMOD)) {
		throw failure('module-not-found', 'Go module mode is not active for the selected file.');
	}
	const activeModule = await canonicalFileUri(pathToFileURL(goEnvironment.GOMOD).toString());
	if (fileKey(activeModule) !== fileKey(goModUri)) {
		throw failure('module-not-found', 'Go selected a different module for this directory.');
	}
	// These flags replace inputs managed by the snapshot; support them only with an explicit mapping.
	// 这些参数会替换快照管理的输入，需要建立明确映射后才能支持
	if (
		/(?:^|\s|["'])(?:-modfile|-overlay|-C)(?:=|\s|["']|$)/.test(
			[goEnvironment.GOFLAGS, ...flags.data].join(' '),
		)
	) {
		throw new WorkspaceError({ status: 'unsupported', reason: 'unsupported-build-config' });
	}
	const files = new Set([goModUri, pathToFileURL(path.join(rootPath, 'go.sum')).toString()]);
	let goWorkUri: string | null = null;
	if (goEnvironment.GOWORK && goEnvironment.GOWORK !== 'off') {
		goWorkUri = await canonicalFileUri(pathToFileURL(goEnvironment.GOWORK).toString());
		files.add(goWorkUri);
		files.add(`${goWorkUri}.sum`);
	}
	const baseFiles = [...files];
	if (baseFiles.some((uri) => unsaved.has(fileKey(uri)))) {
		throw new WorkspaceError({ status: 'unsupported', reason: 'unsaved-module-config' });
	}
	const beforeMetadata = await configurationDigest(baseFiles);
	const metadata = await run(['mod', 'edit', '-json', fileURLToPath(goModUri)], moduleSchema);
	const replacements = (metadata.Replace ?? []).map((item) => ({ item, directory: rootPath }));
	if (goWorkUri) {
		const workPath = fileURLToPath(goWorkUri);
		const work = await run(['work', 'edit', '-json', workPath], workSchema);
		const roots = await Promise.all(
			(work.Use ?? []).map((item) =>
				canonicalFileUri(
					pathToFileURL(path.resolve(path.dirname(workPath), item.DiskPath)).toString(),
				),
			),
		);
		if (!roots.some((uri) => fileKey(uri) === fileKey(pathToFileURL(rootPath).toString()))) {
			throw failure(
				'module-not-found',
				'The selected module is not included in the active go.work.',
			);
		}
		for (const root of roots) {
			files.add(pathToFileURL(path.join(fileURLToPath(root), 'go.mod')).toString());
			files.add(pathToFileURL(path.join(fileURLToPath(root), 'go.sum')).toString());
		}
		replacements.push(
			...(work.Replace ?? []).map((item) => ({ item, directory: path.dirname(workPath) })),
		);
	}
	for (const { item, directory } of replacements) {
		if (!item.New.Version) {
			const root = path.resolve(directory, item.New.Path);
			files.add(pathToFileURL(path.join(root, 'go.mod')).toString());
			files.add(pathToFileURL(path.join(root, 'go.sum')).toString());
		}
	}
	if (goEnvironment.GOENV && goEnvironment.GOENV !== 'off') {
		files.add(pathToFileURL(goEnvironment.GOENV).toString());
	}
	const configurationUris = [
		...new Set(await Promise.all([...files].map(canonicalFileUri))),
	].sort();
	if (configurationUris.some((uri) => unsaved.has(fileKey(uri)))) {
		throw new WorkspaceError({ status: 'unsupported', reason: 'unsaved-module-config' });
	}
	const digest = await configurationDigest(configurationUris);
	// Do not combine metadata read from different revisions of the module configuration.
	// 避免把不同版本的模块配置元数据组合进同一个上下文
	if (
		initialDigest !== (await configurationDigest([goModUri])) ||
		beforeMetadata !== (await configurationDigest(baseFiles))
	) {
		throw new WorkspaceError({ status: 'stale' });
	}
	checkCancelled(signal);
	const key = createHash('sha256')
		.update(
			JSON.stringify([
				goExecutable,
				Object.entries(goEnvironment).sort(),
				flags.data,
				digest,
			]),
		)
		.update(JSON.stringify(Object.entries(environment).sort()))
		.digest('hex');
	return {
		sourceUri,
		module: {
			goModUri,
			rootUri: pathToFileURL(rootPath).toString(),
			modulePath: metadata.Module.Path,
		},
		build: {
			key,
			goVersion: goEnvironment.GOVERSION,
			goos: goEnvironment.GOOS,
			goarch: goEnvironment.GOARCH,
			cgoEnabled: goEnvironment.CGO_ENABLED === '1',
			buildFlags: [...flags.data],
			goWorkUri,
		},
		goExecutable,
		environment,
		configurationUris,
		configurationDigest: digest,
	};
}
