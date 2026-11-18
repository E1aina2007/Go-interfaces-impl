// Package cache provides a key-value store that keeps the most recent entry.
// cache 包提供只保留最近一条记录的键值存储
package cache

type Store interface {
	Get(key string) (string, bool)
	Put(key, value string)
}

type Memory struct {
	key, value string
	present    bool
}

func (m *Memory) Get(key string) (string, bool) {
	if !m.present || m.key != key {
		return "", false
	}
	return m.value, true
}

func (m *Memory) Put(key, value string) {
	m.key = key
	m.value = value
	m.present = true
}

var _ Store = (*Memory)(nil)
