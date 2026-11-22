import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileKey, isMissingPath, type GoModule } from './module';

interface Replacement {
	readonly modulePath: string;
	readonly version: string | undefined;
	readonly target: string;
	readonly local: boolean;
}

interface ModuleDirectives {
	readonly required: ReadonlyMap<string, string>;
	readonly replacements: readonly Replacement[];
	readonly use: readonly string[];
}

export interface LocalDependencies {
	readonly required: ReadonlyMap<string, string>;
	readonly replacements: ReadonlyMap<string, string | null>;
}

type ReadConfig = (filename: string) => Promise<string | undefined>;

const quotedEscapes: Readonly<Record<string, string>> = {
	a: '\x07',
	b: '\b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
	'"': '"',
	'\\': '\\',
};

function configValue(token: string): string | undefined {
	if (!token.startsWith('"')) {
		return token;
	}
	const text = token.slice(1, -1);
	const parts = text.match(
		/[^\\]+|\\(?:[0-7]{3}|x[\da-fA-F]{2}|u[\da-fA-F]{4}|U[\da-fA-F]{8}|.)/g,
	);
	if ((parts ?? []).join('') !== text) {
		return undefined;
	}
	// Go octal and hexadecimal escapes represent bytes in a quoted path.
	// Go 引号路径中的八进制和十六进制转义表示字节
	const bytes: Buffer[] = [];
	for (const part of parts ?? []) {
		if (!part.startsWith('\\')) {
			bytes.push(Buffer.from(part));
			continue;
		}
		const escape = part.slice(1);
		if (/^[0-7]{3}$/.test(escape) || /^x[\da-fA-F]{2}$/.test(escape)) {
			const value = escape.startsWith('x')
				? Number.parseInt(escape.slice(1), 16)
				: Number.parseInt(escape, 8);
			if (value > 255) return undefined;
			bytes.push(Buffer.from([value]));
			continue;
		}
		if (/^(?:u[\da-fA-F]{4}|U[\da-fA-F]{8})$/.test(escape)) {
			const value = Number.parseInt(escape.slice(1), 16);
			if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return undefined;
			bytes.push(Buffer.from(String.fromCodePoint(value)));
			continue;
		}
		const value = quotedEscapes[escape];
		if (value === undefined) return undefined;
		bytes.push(Buffer.from(value));
	}
	return Buffer.concat(bytes).toString('utf8');
}

function readDirectives(text: string): ModuleDirectives {
	const required = new Map<string, string>();
	const replacements: Replacement[] = [];
	const use: string[] = [];
	let block: string | undefined;
	for (const line of text.split(/\r?\n/)) {
		const tokens = line.match(/\/\/.*$|"(?:\\.|[^"\\])*"|[()]|[^\s()"]+/g) ?? [];
		if (tokens.at(-1)?.startsWith('//')) {
			tokens.pop();
		}
		if (tokens[0] === ')') {
			block = undefined;
			continue;
		}
		const directive = block ?? tokens.shift();
		if (!block && tokens[0] === '(') {
			block = directive;
			continue;
		}
		const args = tokens.map(configValue);
		const [first, second] = args;
		if (directive === 'require' && first && second && args.length === 2) {
			required.set(first, second);
		} else if (directive === 'use' && first && args.length === 1) {
			use.push(first);
		} else if (directive === 'replace' && first) {
			const arrow = args.indexOf('=>');
			const target = args[arrow + 1];
			if ((arrow !== 1 && arrow !== 2) || !target) {
				continue;
			}
			const local =
				args.length === arrow + 2 &&
				(path.isAbsolute(target) || /^\.\.?([/\\]|$)/.test(target));
			replacements.push({
				modulePath: first,
				version: arrow === 2 ? second : undefined,
				target,
				local,
			});
		}
	}
	return { required, replacements, use };
}

function replacementFor(
	rules: readonly Replacement[],
	modulePath: string,
	version: string,
): Replacement | undefined {
	return (
		rules.find((rule) => rule.modulePath === modulePath && rule.version === version) ??
		rules.find((rule) => rule.modulePath === modulePath && rule.version === undefined)
	);
}

async function directoryKey(directory: string): Promise<string | undefined> {
	try {
		return fileKey(pathToFileURL(await realpath(directory)).href);
	} catch (error) {
		if (!isMissingPath(error)) {
			throw error;
		}
		return undefined;
	}
}

async function workFile(
	directory: string,
	setting: string | undefined,
	read: ReadConfig,
): Promise<{ filename: string; text: string } | undefined> {
	if (setting === 'off') {
		return undefined;
	}
	if (setting && setting !== 'auto') {
		if (!path.isAbsolute(setting)) return undefined;
		const text = await read(setting);
		return text === undefined ? undefined : { filename: setting, text };
	}
	for (;;) {
		const filename = path.join(directory, 'go.work');
		const text = await read(filename);
		if (text !== undefined) {
			return { filename, text };
		}
		const parent = path.dirname(directory);
		if (parent === directory) {
			return undefined;
		}
		directory = parent;
	}
}

export async function readLocalDependencies(
	module: GoModule,
	sourceDirectory: string,
	goWork: string | undefined,
	read: ReadConfig,
): Promise<LocalDependencies> {
	const root = fileURLToPath(module.rootUri);
	const manifest = readDirectives((await read(fileURLToPath(module.goModUri))) ?? '');
	const work = await workFile(sourceDirectory, goWork, read);
	const workRoot = work && path.dirname(work.filename);
	const workDirectives = work && readDirectives(work.text);
	let workRules: readonly Replacement[] = [];
	if (workRoot && workDirectives) {
		for (const directory of workDirectives.use) {
			if (
				(await directoryKey(path.resolve(workRoot, directory))) === fileKey(module.rootUri)
			) {
				workRules = workDirectives.replacements;
				break;
			}
		}
	}
	const replacements = new Map<string, string | null>();
	for (const [modulePath, version] of manifest.required) {
		const workRule = replacementFor(workRules, modulePath, version);
		const rule = workRule ?? replacementFor(manifest.replacements, modulePath, version);
		if (!rule?.local) {
			continue;
		}
		const key = await directoryKey(
			path.resolve(workRule && workRoot ? workRoot : root, rule.target),
		);
		if (key === undefined) {
			continue;
		}
		// A location alone cannot distinguish two import paths backed by the same directory.
		// 两个导入路径共用目录时，单凭位置无法区分归属
		const previous = replacements.get(key);
		replacements.set(
			key,
			previous === undefined || previous === modulePath ? modulePath : null,
		);
	}
	return { required: manifest.required, replacements };
}
