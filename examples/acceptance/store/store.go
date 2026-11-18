// Package store defines the key-value store interface.
// store 包定义键值存储接口
package store

type Store interface {
	Get(key string) (string, bool)
	Put(key, value string)
}
