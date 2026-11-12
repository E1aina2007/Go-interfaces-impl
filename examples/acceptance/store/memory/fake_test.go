package memory

import "testing"

// fakeStore is declared in a _test.go file that imports testing and is hidden by default.
// fakeStore 声明在导入 testing 的 _test.go 文件中，默认被过滤
type fakeStore struct{}

func (fakeStore) Get(string) (string, bool) { return "", false }

func (fakeStore) Put(string, string) {}

// Keep the exact testing import for filtering without adding an executable unit test.
// 保留过滤所需的精确 testing 导入，不定义可执行的单元测试
var _ *testing.T
