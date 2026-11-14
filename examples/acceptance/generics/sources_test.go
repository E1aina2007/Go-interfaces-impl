package generics

import "testing"

var _ *testing.T

// TestBox demonstrates how the test source filter treats this implementation.
// TestBox 展示测试来源过滤如何处理该实现
type TestBox[T any] struct {
	Value T
}

func (b TestBox[U]) Label() string { return "test box" }

var _ Label = TestBox[int]{}
