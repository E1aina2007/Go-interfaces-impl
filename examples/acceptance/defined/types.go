package defined

type Formatter interface {
	Format(value string) string
}

// FormatterFunc adapts a function to the Formatter interface.
// FormatterFunc 将函数适配为 Formatter 接口
type FormatterFunc func(string) string

func (f FormatterFunc) Format(value string) string { return f(value) }

var _ Formatter = FormatterFunc(nil)
