// Package pointers covers cross-package pointer aliases and unsupported pointer forms.
// pointers 包展示跨包指针别名及不支持的指针形态
package pointers

import (
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/generics"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/shapes"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store/memory"
)

type ExternalRectPointer = *shapes.Rect
type ExternalRectAlias = ExternalRectPointer
type ViaShapeAlias = shapes.RectPointer
type ParenthesizedPointer = (*shapes.Rect)
type ParenthesizedTarget = *(shapes.Rect)
type MemoryPointer = *memory.Memory

// These valid declarations must not be normalized into a supported struct relationship.
// 以下合法声明不得被归并为受支持的结构体关系
type DoublePointer = **shapes.Rect
type IndirectDoublePointer = *shapes.RectPointer
type InterfacePointer = *shapes.Shape
type DefinedPointer *shapes.Rect
type DefinedFromAlias shapes.RectPointer
type DefinedFromChain ExternalRectAlias
type GenericPointer = *generics.Box[int]
type BasicPointer = *int
type FunctionPointer = *func()
type SlicePointer = *[]string
type AnonymousPointer = *struct{}

var (
	_ shapes.Shape = ExternalRectPointer(nil)
	_ shapes.Shape = ExternalRectAlias(nil)
	_ shapes.Shape = ViaShapeAlias(nil)
	_ shapes.Shape = ParenthesizedPointer(nil)
	_ shapes.Shape = ParenthesizedTarget(nil)
	_ store.Store  = MemoryPointer(nil)
)
