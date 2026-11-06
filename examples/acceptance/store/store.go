// Package store declares the interface used by the cross-package and testing filter scenarios.
package store

// With filtering enabled, Store is expected to show Base, Embedded ?, Memory, helperStore and quickStore.
// With filtering disabled, Partial and fakeStore are expected to appear as well.
type Store interface {
	Get(key string) (string, bool)
	Put(key, value string)
}

// Base implements Store and is embedded by memory.Embedded.
type Base struct {
	data map[string]string
}

func (b *Base) Get(key string) (string, bool) {
	value, ok := b.data[key]
	return value, ok
}

func (b *Base) Put(key, value string) {
	if b.data == nil {
		b.data = map[string]string{}
	}
	b.data[key] = value
}
