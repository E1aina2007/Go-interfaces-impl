// Package a declares one of two independent Reset requirements.
// a 包声明两个独立 Reset 要求中的一个
package a

// Resetter declares Reset in package a.
// Resetter 在 a 包中声明 Reset 方法
type Resetter interface {
	Reset()
}
