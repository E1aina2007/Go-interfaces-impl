package main

import (
	"fmt"
	"io"
	"strings"

	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/defined"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/generics"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/shapes"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store/memory"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/stream"
)

// Use interfaces across packages so the example can also run as a standalone program.
// 通过接口使用各包，使示例也能作为独立程序运行
func main() {
	var formatter defined.Formatter = defined.FormatterFunc(strings.ToUpper)
	fmt.Printf("Format: %s\n", formatter.Format("go"))

	var shape shapes.Shape = shapes.Rect{Width: 3, Height: 4}
	fmt.Printf("Shape: area=%.0f perimeter=%.0f\n", shape.Area(), shape.Perimeter())

	var data store.Store = &memory.Memory{}
	data.Put("language", "Go")
	value, ok := data.Get("language")
	fmt.Printf("Store: language=%s found=%t\n", value, ok)

	var buffer stream.ReadWriteCloser = &stream.Buffer{}
	if _, err := buffer.Write([]byte("Go")); err != nil {
		panic(err)
	}
	content, err := io.ReadAll(buffer)
	if err != nil {
		panic(err)
	}
	if err := buffer.Close(); err != nil {
		panic(err)
	}
	fmt.Printf("Stream: %s\n", content)

	box := generics.Box[string]{Name: "language", Value: "Go"}
	var label generics.Label = box
	fmt.Printf("Box: %s=%s\n", label.Label(), box.Value)
}
