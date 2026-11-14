// Package shapes demonstrates interface implementations with value and pointer receivers.
// shapes 包展示值接收者和指针接收者实现接口
package shapes

import "math"

// Shape is implemented implicitly by types that provide both methods.
// 同时提供两个方法的类型会隐式实现 Shape
type Shape interface {
	Area() float64
	Perimeter() float64
}

type Rect struct {
	Width, Height float64
}

func (r Rect) Area() float64 { return r.Width * r.Height }

func (r Rect) Perimeter() float64 { return 2 * (r.Width + r.Height) }

// Circle uses pointer receivers, so *Circle implements Shape.
// Circle 使用指针接收者，因此 *Circle 实现 Shape
type Circle struct {
	Radius float64
}

func (c *Circle) Area() float64 { return math.Pi * c.Radius * c.Radius }

func (c *Circle) Perimeter() float64 { return 2 * math.Pi * c.Radius }

type Square struct {
	Side float64
}

func (s Square) Area() float64 { return s.Side * s.Side }

func (s Square) Perimeter() float64 { return 4 * s.Side }

// These assignments check the implementations at compile time.
// 这些赋值在编译时检查接口实现
var (
	_ Shape = Rect{}
	_ Shape = (*Circle)(nil)
	_ Shape = Square{}
)
