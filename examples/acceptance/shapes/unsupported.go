package shapes

// The declarations below are outside the supported query range and should show no annotation.

// Any is an empty interface.
type Any interface{}

// Number is a constraint interface.
type Number interface {
	~int | ~float64
}

// Pair is a generic struct.
type Pair[T any] struct {
	Left, Right T
}

// Sizer is a generic interface.
type Sizer[T Number] interface {
	Size() T
}

// Names is a composite type.
type Names []string

// RectPointer is a pointer alias.
type RectPointer = *Rect
