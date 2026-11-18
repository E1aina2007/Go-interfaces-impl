# Go interface implementation examples

[简体中文](README.md)

This directory is a standalone Go module. Run `go run .` here to try the examples.

From the repository root, run `npm ci`, then select **Run Extension (Acceptance Examples)** in VS Code and press **F5**. If the extension is installed, open the module with `code examples/acceptance`. Set up the official Go extension (`golang.go`), Go SDK, and gopls, then wait for the language server to load.

Click a related type name above a declaration to navigate, or click the direction and count to open the list. Enable `editor.codeLens` for the names and `editor.glyphMargin` for the icons. Results depend on the locations reported by the Go language service.

## Implementation examples

| File                                   | What to query                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [shapes/shapes.go](shapes/shapes.go)   | Query `Shape` for three implementations. `Rect` and `Square` use value receivers. `Circle` uses pointer receivers. |
| [store/store.go](store/store.go)       | [Memory](store/memory/memory.go) implements `Store` from another package.                                          |
| [stream/stream.go](stream/stream.go)   | `ReadWriter` combines `Reader` and `Writer`. `Buffer` implements it by embedding `bytes.Buffer`.                   |
| [defined/types.go](defined/types.go)   | `FormatterFunc` adapts a function to the `Formatter` interface.                                                    |
| [generics/types.go](generics/types.go) | The generic struct `Box[T]` implements `Label`.                                                                    |

## Test source filtering

1. Query `Store` in [store.go](store/store.go). Filtering is on by default and the list shows `Memory`.
2. Run **Go Interfaces: Toggle Test Source Filter** to turn filtering off, then query `Store` again. The list also shows `fakeStore` from the test file.
3. Turn filtering back on. Place the cursor on the `Store` reference in [fake_test.go](store/memory/fake_test.go) and run **Go Interfaces: Show Implementing Types**. This test-file query includes both `Memory` and `fakeStore`.
