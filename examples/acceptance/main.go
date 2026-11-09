package main

import (
	"fmt"

	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/reset"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/shapes"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store/memory"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/stream"
)

// Use interfaces across packages so the example can also run as a standalone program.
// 通过接口使用各包，使示例也能作为独立程序运行
func main() {
	var shape shapes.Shape = shapes.Rect{W: 3, H: 4}
	fmt.Printf("Shape: area=%.0f perimeter=%.0f\n", shape.Area(), shape.Perimeter())

	var data store.Store = &memory.Memory{}
	data.Put("language", "Go")
	value, ok := data.Get("language")
	fmt.Printf("Store: language=%s found=%t\n", value, ok)

	var file stream.ReadWriteCloser = &stream.File{}
	written, err := file.Write([]byte("Go"))
	if err != nil {
		panic(err)
	}
	if err := file.Close(); err != nil {
		panic(err)
	}
	fmt.Printf("Stream: written=%d closed=true\n", written)

	var machine reset.Both = &reset.Machine{}
	machine.Reset()
	fmt.Println("Reset: shared method satisfies both embedded interfaces")
}
