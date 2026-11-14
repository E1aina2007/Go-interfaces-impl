// Package generictypes covers direct methods on generic collections and function types.
// generictypes 包展示泛型集合和函数类型的直接方法
package generictypes

type Sized interface {
	Len() int
}

type Arity interface {
	Arity() int
}

type List[T any] []T

// Receiver parameters can use different names from the declaration.
// 接收者类型参数可以使用与声明不同的名称
func (list List[U]) Len() int { return len(list) }

// A dependent method must not prevent unrelated, independent relations.
// 依赖类型参数的方法不应阻止其他签名独立的关系
func (list List[U]) First() U {
	if len(list) > 0 {
		return list[0]
	}
	var zero U
	return zero
}

type Array[T any] [2]T

func (array *Array[U]) Len() int { return len(array) }

type Dict[K comparable, V any] map[K]V

func (dict Dict[Key, Value]) Len() int { return len(dict) }

type Queue[T any] chan T

func (queue Queue[U]) Len() int { return len(queue) }

type Func[T any] func(T)

// The underlying function uses T; this method's signature is independent.
// 底层函数使用 T，但此方法的签名不依赖类型参数
func (function *Func[U]) Arity() int { return 1 }

type Missing[T any] []T

// FirstString matches List[string], but the generic relation is not supported.
// FirstString 与 List[string] 匹配，但该泛型关系不受支持
type FirstString interface {
	First() string
}

type SizedFirstString interface {
	Sized
	FirstString
}

// Len exists only in the test build context.
// Len 仅存在于测试构建上下文
type TestMethodList[T any] []T

// Generic references remain outside the supported declaration forms.
// 泛型引用仍不属于支持的声明形态
type IntList = List[int]
type NewList List[int]
type RefList[T any] List[T]
type Counter[T any] int

var (
	_ Sized = List[int]{}
	_ Sized = (*Array[int])(nil)
	_ Sized = Dict[string, int]{}
	_ Sized = Queue[int](nil)
	_ Arity = (*Func[int])(nil)

	// These instantiations are valid, but the whole generic declaration is rejected.
	// 这些实例合法，但插件不将关系推广到整个泛型声明
	_ FirstString      = List[string]{}
	_ SizedFirstString = List[string]{}
)
