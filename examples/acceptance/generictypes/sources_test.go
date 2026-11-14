package generictypes

import "testing"

var _ *testing.T

// TestList is declared in test code; TestMethodList gains Len only here.
// TestList 在测试代码中声明，TestMethodList 仅在此处获得 Len 方法
type TestList[T any] []T

func (list TestList[U]) Len() int { return len(list) }

func (list TestMethodList[U]) Len() int { return len(list) }

var (
	_ Sized = TestList[int]{}
	_ Sized = TestMethodList[int]{}
)
