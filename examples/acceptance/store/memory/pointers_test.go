package memory

import (
	"testing"

	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"
)

// Alias files do not replace the canonical type's declaration and method origins.
// 别名所在文件不替换规范类型的声明及方法来源
type PartialPointer = *Partial
type FakeStorePointer = *fakeStore
type ProductionStorePointer = *Memory

var (
	_ *testing.T
	_ store.Store = PartialPointer(nil)
	_ store.Store = FakeStorePointer(nil)
	_ store.Store = ProductionStorePointer(nil)
)
