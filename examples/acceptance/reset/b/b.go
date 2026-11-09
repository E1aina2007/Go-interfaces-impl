// Package b declares the second, separately declared Reset requirement.
// b 包独立声明另一个 Reset 要求
package b

// Clearer declares Reset in package b.
// Clearer 在 b 包中声明 Reset 方法
type Clearer interface {
	Reset()
}
