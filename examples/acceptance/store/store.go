// Package store declares the interface used by the cross-package and testing filter scenarios.
// store 包提供跨包实现与测试来源过滤共用的接口
package store

// Store can be implemented implicitly by types in other packages.
// Store 可以由其他包中的类型隐式实现
type Store interface {
	Get(key string) (string, bool)
	Put(key, value string)
}
