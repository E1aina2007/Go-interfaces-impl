// Package shapes covers direct declarations, aliases, named definitions and pointer receivers.
package shapes

import "math"

// Shape is expected to show Circle, Rect and Square.
type Shape interface {
	Area() float64
	Perimeter() float64
}

// Rect implements Shape with value receivers.
type Rect struct {
	W, H float64
}

func (r Rect) Area() float64 { return r.W * r.H }

func (r Rect) Perimeter() float64 { return 2 * (r.W + r.H) }

// Circle implements Shape with pointer receivers.
type Circle struct {
	R float64
}

func (c *Circle) Area() float64 { return math.Pi * c.R * c.R }

func (c *Circle) Perimeter() float64 { return 2 * math.Pi * c.R }

// Figure is an alias and resolves to Shape.
type Figure = Shape

// Box is an alias and shares the identity of Rect.
type Box = Rect

// Square is a new defined type; it implements Shape only through its own methods.
type Square Rect

func (s Square) Area() float64 { return s.W * s.W }

func (s Square) Perimeter() float64 { return 4 * s.W }

// Tile is a new defined type without methods; it does not inherit Rect's methods.
type Tile Rect

// Plain has no methods and is expected to show no annotation.
type Plain struct {
	Name string
}
