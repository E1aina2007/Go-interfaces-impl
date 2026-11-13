package generics

import "testing"

var _ *testing.T

type TestBox[T any] struct {
	Value T
}

func (b TestBox[U]) Label() string { return "test box" }

var _ Label = TestBox[int]{}
