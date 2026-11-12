package memory

import (
	"testing"

	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"
)

// Put completes Store for Partial only in the test package variant.
// Put 只在测试包变体中补齐 Partial 实现 Store 所需的方法
func (p Partial) Put(key, value string) {}

// Keep the exact testing import for filtering without adding an executable unit test.
// 保留过滤所需的精确 testing 导入，不定义可执行的单元测试
var (
	_ *testing.T
	_ store.Store = Partial{}
)
