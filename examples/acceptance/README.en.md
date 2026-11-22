# Go interface implementation examples

[简体中文](README.md)

This directory is a standalone Go module. Run `go run .` here to try the examples.

From the repository root, run `npm ci`, then select **Run Extension (Acceptance Examples)** in VS Code and press **F5**. If the extension is installed, open the module with `code examples/acceptance`. Set up the official Go extension (`golang.go`), Go SDK, and gopls, then wait for the language server to load.

Click a related type name above a declaration to navigate, or click the direction and count to open the list. Enable `editor.codeLens` for the names and `editor.glyphMargin` for the icons. Results depend on the locations reported by the Go language service.

## Implementation examples

| File                                   | What to query                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [shapes/shapes.go](shapes/shapes.go)   | Query `Shape` for three implementations. `Rect` and `Square` use value receivers. `Circle` uses pointer receivers. |
| [store/store.go](store/store.go)       | Query `store.Store` to see `cache.Memory` and `memory.Memory`.                                                     |
| [stream/stream.go](stream/stream.go)   | `ReadWriter` combines `Reader` and `Writer`. `Buffer` implements it by embedding `bytes.Buffer`.                   |
| [defined/types.go](defined/types.go)   | `FormatterFunc` adapts a function to the `Formatter` interface.                                                    |
| [generics/types.go](generics/types.go) | The generic struct `Box[T]` implements `Label`.                                                                    |

Above the `Memory` declaration in [memory/memory.go](store/memory/memory.go), select `cache.Store` and `store.Store` to open the interfaces in the [cache package](store/cache/cache.go) and the [store package](store/store.go). The hover links and the full list use the same names.

In [stream.go](stream/stream.go), look for the current module's `stream.Buffer` above `Reader`. If the language service returns `bytes.Buffer`, select `Show all results` to find it in the standard library group. Switch to another file and back to see the cached current-module relationships immediately.

## Test source filtering

1. Query `Store` in [store.go](store/store.go). Filtering is on by default and the list shows `cache.Memory` and `memory.Memory`.
2. Run **Go Interfaces: Toggle Test Source Filter** to turn filtering off, then query `Store` again. The list also shows `memory.fakeStore` from the test file.
3. Turn filtering back on. Place the cursor on the `Store` reference in [fake_test.go](store/memory/fake_test.go) and run **Go Interfaces: Show Implementing Types**. This test-file query includes both ordinary implementations and `memory.fakeStore`.
