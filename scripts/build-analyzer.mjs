import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const platforms = { win32: 'windows', linux: 'linux', darwin: 'darwin' };
const architectures = { x64: 'amd64', arm64: 'arm64' };
const goos = platforms[process.platform];
const goarch = architectures[process.arch];
if (!goos || !goarch || (process.platform === 'win32' && process.arch !== 'x64')) {
	throw new Error(`Unsupported analyzer host: ${process.platform}-${process.arch}`);
}
const output = path.join(root, 'dist', 'analyzer', `${process.platform}-${process.arch}`);
mkdirSync(output, { recursive: true });
const filename =
	process.platform === 'win32' ? 'go-interfaces-analyzer.exe' : 'go-interfaces-analyzer';

// Build for the Node host even when the developer's Go environment targets another platform.
// 即使开发者的 Go 环境指定了其他目标平台，也按 Node 宿主平台构建
execFileSync(
	process.env.GO_INTERFACES_BUILD_GO || 'go',
	[
		'build',
		'-mod=readonly',
		'-trimpath',
		'-o',
		path.join(output, filename),
		'./cmd/go-interfaces-analyzer',
	],
	{
		cwd: path.join(root, 'analyzer'),
		env: {
			...process.env,
			GOOS: goos,
			GOARCH: goarch,
			CGO_ENABLED: '0',
			GOWORK: 'off',
			GOFLAGS: '',
		},
		stdio: 'inherit',
		windowsHide: true,
	},
);
