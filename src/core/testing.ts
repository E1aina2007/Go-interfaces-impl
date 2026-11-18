// Go excludes test files from ordinary package builds regardless of their imports.
// Go 的普通包构建排除测试文件，不取决于文件中的导入
export function isTestFile(path: string): boolean {
	return path.endsWith('_test.go');
}
