package defined

// Text is implemented by named types with their own String method.
// Text 由声明了自身 String 方法的具名类型实现
type Text interface {
	String() string
}

// Func adapts a function through a method, not through its function signature.
// Func 通过方法适配函数，而不是通过函数签名实现接口
type Func func() string

func (f Func) String() string { return f() }

// FuncAlias shares Func's identity; DerivedFunc does not inherit its methods.
// FuncAlias 与 Func 共享身份，DerivedFunc 不继承 Func 的方法
type FuncAlias = Func
type DerivedFunc Func
type OwnFunc Func

func (f OwnFunc) String() string { return f() }

type Count int

func (Count) String() string { return "count" }

type Word string

func (w Word) String() string { return string(w) }

type Flag bool

func (Flag) String() string { return "flag" }

type Octet byte

func (Octet) String() string { return "byte" }

type List []string

func (List) String() string { return "slice" }

type Pair [2]string

func (Pair) String() string { return "array" }

type Dict map[string]string

func (Dict) String() string { return "map" }

type Queue chan string

func (Queue) String() string { return "channel" }

// PointerFunc requires a pointer receiver; value and pointer forms share one displayed declaration.
// PointerFunc 需要指针接收者，值与指针形式共享一个展示声明
type PointerFunc func() string

func (f *PointerFunc) String() string { return (*f)() }

// TestMethodFunc only gains String in the test variant and must be hidden with filtering enabled.
// TestMethodFunc 仅在测试变体中具有 String 方法，开启过滤时应隐藏
type TestMethodFunc func() string

// RawFunc has no method and must not match Text despite returning a string.
// RawFunc 没有方法，即使返回字符串也不应匹配 Text
type RawFunc func() string

// Compile-time assignments check value and pointer method sets when the example is built.
// 构建示例时通过编译期赋值检查值与指针的方法集
var (
	_ Text = Func(nil)
	_ Text = OwnFunc(nil)
	_ Text = Count(0)
	_ Text = Word("")
	_ Text = Flag(false)
	_ Text = Octet(0)
	_ Text = List(nil)
	_ Text = Pair{}
	_ Text = Dict(nil)
	_ Text = Queue(nil)
	_ Text = (*PointerFunc)(nil)
)
