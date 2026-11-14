// Package memory demonstrates a cross-package implementation and an embedded type.
// memory 包展示跨包实现和类型嵌入
package memory

import "github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"

// Memory implements store.Store directly from another package.
// Memory 直接实现另一个包中的 store.Store
type Memory struct {
	data map[string]string
}

func (m *Memory) Get(key string) (string, bool) {
	value, ok := m.data[key]
	return value, ok
}

func (m *Memory) Put(key, value string) {
	// Initialize on first write so the zero value is ready to use.
	// 首次写入时初始化，让零值可以直接使用
	if m.data == nil {
		m.data = map[string]string{}
	}
	m.data[key] = value
}

// Named adds a name while reusing Memory's promoted methods.
// Named 在复用 Memory 提升方法的同时增加名称
type Named struct {
	Memory
	Name string
}

var (
	_ store.Store = (*Memory)(nil)
	_ store.Store = (*Named)(nil)
)
