// Package store declares the interface used by the cross-package and testing filter scenarios.
// store 包提供跨包实现与测试来源过滤共用的接口
package store

// With filtering enabled, Store is expected to show Base, Embedded ?, Memory, helperStore and quickStore.
// 开启过滤时，Store 应显示 Base、Embedded ?、Memory、helperStore 和 quickStore
// With filtering disabled, Partial and fakeStore are expected to appear as well.
// 关闭过滤后，预期还会显示 Partial 和 fakeStore
type Store interface {
	Get(key string) (string, bool)
	Put(key, value string)
}

// Base implements Store and is embedded by memory.Embedded.
// Base 实现 Store，并被 memory.Embedded 嵌入
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

var _ Store = (*Base)(nil)
