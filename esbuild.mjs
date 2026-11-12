import * as esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const assets = fileURLToPath(new URL('./dist/wasm/', import.meta.url));
const source = path.dirname(fileURLToPath(import.meta.resolve('@vscode/tree-sitter-wasm')));
await mkdir(assets, { recursive: true });
for (const filename of ['tree-sitter.wasm', 'tree-sitter-go.wasm']) {
	await copyFile(path.join(source, filename), path.join(assets, filename));
}

const context = await esbuild.context({
	entryPoints: ['src/extension.ts'],
	bundle: true,
	format: 'cjs',
	platform: 'node',
	target: 'es2022',
	outfile: 'dist/extension.js',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	// The extension host provides this module; it must stay outside the bundle.
	// vscode 模块由扩展宿主提供，不能打入构建产物
	external: ['vscode'],
	logLevel: 'info',
});

if (watch) {
	await context.watch();
} else {
	try {
		await context.rebuild();
	} finally {
		await context.dispose();
	}
}
