// Package memory covers cross-package implementations, aliases and the testing filter.
package memory

import "goifaces.example/acceptance/store"

// Memory implements store.Store directly from another package.
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
type Embedded struct {
	store.Base
}

// Local is an alias of a cross-package interface and resolves to store.Store.
type Local = store.Store

var (
	_ store.Store = (*Memory)(nil)
	_ store.Store = (*Embedded)(nil)
)
