// Package a declares one of two independent Reset requirements.
package a

// Resetter declares Reset in package a.
type Resetter interface {
	Reset()
}
