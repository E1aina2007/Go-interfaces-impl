// Package b declares the second, separately declared Reset requirement.
package b

// Clearer declares Reset in package b.
type Clearer interface {
	Reset()
}
