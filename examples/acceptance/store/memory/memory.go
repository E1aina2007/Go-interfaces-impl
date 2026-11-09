// Package memory covers cross-package implementations, aliases and the testing filter.
// memory 包展示跨包实现、别名与测试来源过滤
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
	if m.data == nil {
		m.data = map[string]string{}
	}
	m.data[key] = value
}

// Embedded implements store.Store through promoted methods and is expected to show "?".
// Embedded 通过提升方法实现 store.Store，预期保留并显示来源未确认标记
type Embedded struct {
	store.Base
}

// Local is an alias of a cross-package interface and resolves to store.Store.
// Local 是跨包接口别名，解析后与 store.Store 共享身份
type Local = store.Store

var (
	_ store.Store = (*Memory)(nil)
	_ store.Store = (*Embedded)(nil)
)
