package defined

import (
	"strconv"
	"strings"
)

type Formatter interface {
	Format(value string) string
}

// FormatterFunc adapts a function to the Formatter interface.
// FormatterFunc 将函数适配为 Formatter 接口
type FormatterFunc func(string) string

func (f FormatterFunc) Format(value string) string { return f(value) }

// Text can be implemented by named basic and collection types.
// 具名基础类型和集合类型可以实现 Text
type Text interface {
	String() string
}

type Count int

func (c Count) String() string { return strconv.Itoa(int(c)) }

type Word string

func (w Word) String() string { return string(w) }

type List []string

func (l List) String() string { return strings.Join(l, ", ") }

var (
	_ Formatter = FormatterFunc(nil)
	_ Text      = Count(0)
	_ Text      = Word("")
	_ Text      = List(nil)
)
