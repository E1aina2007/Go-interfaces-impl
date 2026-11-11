package shadow

// Shadowed predeclared names must resolve to their local definition.
// 被遮蔽的预声明名称必须解析到本地定义
type int func() string

type Local int

func (f Local) Render() string { return f() }

type Renderable interface {
	Render() string
}

var _ Renderable = Local(nil)
