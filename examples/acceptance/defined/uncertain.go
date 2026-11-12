package defined

type Runner interface {
	Run()
}

type RunFunc func()

func (f RunFunc) Run() { f() }

// Pointer aliases remain outside the resolver's scope, so this origin stays unverified.
// 指针别名仍超出解析范围，因此此方法来源保持未确认
type Holder struct{}
type HolderPointer = *Holder

func (HolderPointer) Run() {}

// Unknown sources must not exclude a relation based only on the observed test method.
// 存在未知来源时，不能仅凭已观察到的测试方法删除关系
type TestRunFunc func()

var (
	_ Runner = RunFunc(nil)
	_ Runner = (*Holder)(nil)
)
