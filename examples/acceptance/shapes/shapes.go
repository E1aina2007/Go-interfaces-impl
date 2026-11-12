// Package shapes covers direct declarations, aliases, named definitions and pointer receivers.
// shapes 包展示直接声明、别名、新定义类型以及指针接收者
package shapes

import "math"

// Shape is expected to show Circle, Rect and Square.
// Shape 应显示 Circle、Rect 和 Square 三个实现者
type Shape interface {
	Area() float64
	Perimeter() float64
}

// Rect implements Shape with value receivers.
// Rect 使用值接收者实现 Shape
type Rect struct {
	W, H float64
}

func (r Rect) Area() float64 { return r.W * r.H }

func (r Rect) Perimeter() float64 { return 2 * (r.W + r.H) }

// Circle implements Shape with pointer receivers.
// Circle 使用指针接收者实现 Shape
type Circle struct {
	R float64
}

func (c *Circle) Area() float64 { return math.Pi * c.R * c.R }

func (c *Circle) Perimeter() float64 { return 2 * math.Pi * c.R }

// Figure is an alias and resolves to Shape.
// Figure 是别名，解析后与 Shape 共享身份
type Figure = Shape

// Box is an alias and shares the identity of Rect.
// Box 是别名，解析后与 Rect 共享身份
type Box = Rect

// Square is a new defined type; it implements Shape only through its own methods.
// Square 是新定义类型，仅通过自己的方法实现 Shape
type Square Rect

func (s Square) Area() float64 { return s.W * s.W }

func (s Square) Perimeter() float64 { return 4 * s.W }

// Tile is a new defined type without methods; it does not inherit Rect's methods.
// Tile 没有自己的方法，不继承 Rect 的方法
type Tile Rect

// Plain has no methods and is expected to show no annotation.
// Plain 没有方法，预期不显示实现关系标记
type Plain struct {
	Name string
}

var (
	_ Shape = Rect{}
	_ Shape = (*Circle)(nil)
	_ Shape = Square{}
)
