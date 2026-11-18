// Package stream demonstrates interface composition with an in-memory buffer.
// stream 包通过内存缓冲区展示接口组合
package stream

import "bytes"

type Reader interface {
	Read(p []byte) (int, error)
}

type Writer interface {
	Write(p []byte) (int, error)
}

type ReadWriter interface {
	Reader
	Writer
}

// Buffer gets its Read and Write methods from the embedded bytes.Buffer.
// Buffer 通过嵌入 bytes.Buffer 获得 Read 和 Write 方法
type Buffer struct {
	bytes.Buffer
}

var _ ReadWriter = (*Buffer)(nil)
