package memory

// Partial declares Get here, while Put exists only in partial_test.go, which imports testing.
// Partial 的 Get 在本文件声明，Put 仅位于导入 testing 的 partial_test.go 中
// With filtering enabled, Partial is expected to be hidden from Store results.
// 开启过滤时，Store 的结果中应隐藏 Partial
type Partial struct {
	value string
}

func (p Partial) Get(key string) (string, bool) { return p.value, p.value != "" }
