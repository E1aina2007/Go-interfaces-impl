// Package stream covers embedded interfaces, including a diamond on Reader.
package stream

// Reader is expected to show File, Pipe and Source.
type Reader interface {
	Read(p []byte) (int, error)
}

// Writer is expected to show File and Pipe.
type Writer interface {
	Write(p []byte) (int, error)
}

// Closer is expected to show File.
type Closer interface {
	Close() error
}

// ReadWriter embeds two interfaces and is expected to show File and Pipe.
type ReadWriter interface {
	Reader
	Writer
}

// ReadCloser embeds two interfaces and is expected to show File.
type ReadCloser interface {
	Reader
	Closer
}

// ReadWriteCloser reaches Reader twice; the shared Read declaration is counted once.
type ReadWriteCloser interface {
	ReadWriter
	ReadCloser
}

// File implements every interface in this package.
type File struct {
	closed bool
}

func (f *File) Read(p []byte) (int, error) { return 0, nil }

func (f *File) Write(p []byte) (int, error) { return len(p), nil }

func (f *File) Close() error {
	f.closed = true
	return nil
}

// Pipe implements Reader, Writer and ReadWriter.
type Pipe struct{}

func (Pipe) Read(p []byte) (int, error) { return 0, nil }

func (Pipe) Write(p []byte) (int, error) { return len(p), nil }

// Source implements Reader only.
type Source struct{}

func (Source) Read(p []byte) (int, error) { return 0, nil }
