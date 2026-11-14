package defined

type Runner interface {
	Run()
}

type RunFunc func()

func (f RunFunc) Run() { f() }

// Resolve the pointer alias to Holder when classifying this production method.
// 判定生产方法来源时，将指针别名解析为 Holder
type Holder struct{}
type HolderPointer = *Holder

func (HolderPointer) Run() {}

// With all method origins classified, test-only implementations are hidden.
// 方法来源全部确认后，过滤仅由测试方法提供的实现
type TestRunFunc func()

var (
	_ Runner = RunFunc(nil)
	_ Runner = (*Holder)(nil)
)
