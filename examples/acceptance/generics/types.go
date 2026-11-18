// Package generics shows direct interface implementations on generic types.
// generics 包展示泛型类型通过直接方法实现接口
package generics

type Label interface {
	Label() string
}

// Box's Label method has the same signature for every type argument.
// Box 的 Label 方法签名不随类型参数变化
type Box[T any] struct {
	Name  string
	Value T
}

func (b Box[T]) Label() string { return b.Name }

var _ Label = Box[int]{}
