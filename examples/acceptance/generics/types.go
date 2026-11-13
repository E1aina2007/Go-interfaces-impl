// Package generics covers direct generic methods with parameter-independent signatures.
// generics 包展示签名不依赖类型参数的泛型直接方法
package generics

type Label interface {
	Label() string
}

type Box[T any] struct {
	Value T
}

// Receiver parameter names need not match the type declaration.
// 接收者类型参数名称不必与类型声明相同
func (b Box[U]) Label() string { return "box" }

type PointerBox[T any] struct {
	Value T
}

func (b *PointerBox[U]) Label() string { return "pointer box" }

type Missing[T any] struct {
	Value T
}

type Dependent[T any] struct {
	Value T
}

// A particular instantiation can match, but this declaration is outside this slice.
// 特定实例可能匹配，但该声明不在本轮支持范围内
func (b Dependent[U]) Label() U { return b.Value }

type LabelWith interface {
	LabelWith(string) string
}

type DependentParameter[T any] struct{}

// Parameter types also participate in the dependency check.
// 参数类型也参与类型参数依赖检查
func (b DependentParameter[U]) LabelWith(value U) string { return "dependent parameter" }

var (
	_ Label     = Box[int]{}
	_ Label     = (*PointerBox[int])(nil)
	_ Label     = Dependent[string]{}
	_ LabelWith = DependentParameter[string]{}
)
