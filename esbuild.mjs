import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

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
