package shapes

// Pointer aliases share the named struct's identity without inheriting methods for new definitions.
// 指针别名共享具名结构体的身份，不为新定义类型继承方法
type RectPointer = *Rect
type RectPointerAlias = RectPointer
type RectPointerViaBox = *Box
type CirclePointer = *Circle
type SquarePointer = *Square
type TilePointer = *Tile

var (
	_ Shape = RectPointer(nil)
	_ Shape = RectPointerAlias(nil)
	_ Shape = RectPointerViaBox(nil)
	_ Shape = CirclePointer(nil)
	_ Shape = SquarePointer(nil)
)
