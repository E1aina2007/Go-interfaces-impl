// Package stream demonstrates interface composition with an in-memory buffer.
// stream 包通过内存缓冲区展示接口组合
package stream

import (
	"bytes"
	"errors"
)

type Reader interface {
	Read(p []byte) (int, error)
}

type Writer interface {
	Write(p []byte) (int, error)
}

type Closer interface {
	Close() error
}

type ReadWriter interface {
	Reader
	Writer
}

// ReadWriteCloser combines the read, write and close interfaces.
// ReadWriteCloser 组合读取、写入和关闭接口
type ReadWriteCloser interface {
	ReadWriter
	Closer
}

var errClosed = errors.New("stream: buffer is closed")

// Buffer stores data in memory and rejects reads and writes after closing.
// Buffer 在内存中保存数据，关闭后拒绝读取和写入
type Buffer struct {
	data   bytes.Buffer
	closed bool
}

func (b *Buffer) Read(p []byte) (int, error) {
	if b.closed {
		return 0, errClosed
	}
	return b.data.Read(p)
}

func (b *Buffer) Write(p []byte) (int, error) {
	if b.closed {
		return 0, errClosed
	}
	return b.data.Write(p)
}

func (b *Buffer) Close() error {
	b.closed = true
	return nil
}

var _ ReadWriteCloser = (*Buffer)(nil)
