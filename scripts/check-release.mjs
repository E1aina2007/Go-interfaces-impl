import { readFile } from 'node:fs/promises';

const tag = process.argv[2];
const versionPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

if (!tag || !versionPattern.test(tag)) {
	throw new Error('Release tag must use vMAJOR.MINOR.PATCH, for example v0.0.9');
}

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lockfile = JSON.parse(
	await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
);
const version = tag.slice(1);

// Check both lockfile versions before installing dependencies or publishing any artifact.
// 在安装依赖或发布产物前核对锁文件的两处版本
for (const [source, actual] of [
	['package.json', manifest.version],
	['package-lock.json', lockfile.version],
	['package-lock.json packages[""]', lockfile.packages?.['']?.version],
]) {
	if (actual !== version) {
		throw new Error(`${source} version ${String(actual)} does not match tag ${tag}`);
	}
}

console.log(`Release version verified: ${tag}`);
