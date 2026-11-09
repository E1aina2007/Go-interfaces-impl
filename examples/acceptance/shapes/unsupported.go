package shapes

// The declarations below are outside the supported query range and should show no annotation.
// 以下声明超出插件支持的查询范围，预期不显示实现关系标记

// Any is an empty interface.
// Any 是空接口
type Any interface{}

// Number is a constraint interface.
// Number 是类型约束接口
type Number interface {
	~int | ~float64
}

// Pair is a generic struct.
// Pair 是泛型结构体
type Pair[T any] struct {
	Left, Right T
}

// Sizer is a generic interface.
// Sizer 是泛型接口
type Sizer[T Number] interface {
	Size() T
}

// Names is a composite type.
// Names 是复合类型
type Names []string

// RectPointer is a pointer alias.
// RectPointer 是指针别名
type RectPointer = *Rect
