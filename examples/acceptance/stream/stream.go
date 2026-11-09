// Package stream covers embedded interfaces, including a diamond on Reader.
// stream 包展示接口嵌入以及 Reader 的菱形嵌入
package stream

// Reader is expected to show File, Pipe and Source.
// Reader 应显示 File、Pipe 和 Source
type Reader interface {
	Read(p []byte) (int, error)
}

// Writer is expected to show File and Pipe.
// Writer 应显示 File 和 Pipe
type Writer interface {
	Write(p []byte) (int, error)
}

// Closer is expected to show File.
// Closer 应显示 File
type Closer interface {
	Close() error
}

// ReadWriter embeds two interfaces and is expected to show File and Pipe.
// ReadWriter 嵌入两个接口，应显示 File 和 Pipe
type ReadWriter interface {
	Reader
	Writer
}

// ReadCloser embeds two interfaces and is expected to show File.
// ReadCloser 嵌入两个接口，应显示 File
type ReadCloser interface {
	Reader
	Closer
}

// ReadWriteCloser reaches Reader twice; the shared Read declaration is counted once.
// ReadWriteCloser 通过两条路径嵌入 Reader，同一个 Read 声明应去重
type ReadWriteCloser interface {
	ReadWriter
	ReadCloser
}

// File implements every interface in this package.
// File 实现本包所有接口
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
// Pipe 实现 Reader、Writer 和 ReadWriter
type Pipe struct{}

func (Pipe) Read(p []byte) (int, error) { return 0, nil }

func (Pipe) Write(p []byte) (int, error) { return len(p), nil }

// Source implements Reader only.
// Source 只实现 Reader
type Source struct{}

func (Source) Read(p []byte) (int, error) { return 0, nil }

var (
	_ ReadWriteCloser = (*File)(nil)
	_ ReadWriter      = Pipe{}
	_ Reader          = Source{}
)
