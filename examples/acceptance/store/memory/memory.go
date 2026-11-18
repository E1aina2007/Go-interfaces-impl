// Package memory implements store.Store with an in-memory map.
// memory 包使用内存 map 实现 store.Store
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

var _ store.Store = (*Memory)(nil)
