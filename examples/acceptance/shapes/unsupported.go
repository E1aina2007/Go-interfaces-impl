package shapes

// Unsupported declarations and methodless generic and slice types show no annotation.
// 以下不支持的声明及没有方法的泛型结构体和切片类型预期不显示实现关系标记

// Any is an empty interface.
// Any 是空接口
type Any interface{}

// Number is a constraint interface.
// Number 是类型约束接口
type Number interface {
	~int | ~float64
}

// Pair is a generic struct with no methods or reported interface matches.
// Pair 是没有方法及语言服务报告的接口匹配的泛型结构体
type Pair[T any] struct {
	Left, Right T
}

// Sizer is a generic interface.
// Sizer 是泛型接口
type Sizer[T Number] interface {
	Size() T
}

// Names is a supported named slice with no methods or reported interface matches.
// Names 是受支持的具名切片，但没有方法及语言服务报告的接口匹配
type Names []string
