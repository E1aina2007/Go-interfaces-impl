# Go Interface Implementation Examples

[简体中文](README.md)

This directory is a standalone Go module that uses only the Go standard library. Its module path is `github.com/E1aina2007/Go-interfaces-impl/examples/acceptance`; imports between packages point to the source in this directory. There is no need to download it from GitHub or configure `replace`, `GOPATH`, or `go.work`. The example source and module configuration are excluded from the VSIX and do not participate in the extension build.

## View the extension in action

When developing the extension, run `npm ci` in the repository root, choose **Run Extension (Acceptance Examples)** in the VS Code Run and Debug view, and press **F5**. This configuration builds the extension and opens this directory and `shapes/shapes.go` in the extension development host.

If the VSIX is already installed, open this directory directly in VS Code:

```sh
code examples/acceptance
```

Install and configure the official Go extension (`golang.go`), its Go SDK, and gopls. Trust the workspace and wait for the language server to finish loading. Then open `shapes/shapes.go` and scroll the `Shape`, `Rect`, and other declarations into view:

- Above `Shape`, expect `Implemented by (3) | Circle | Rect | Square`, with a blue direction icon in the gutter.
- Above `Rect`, expect `Implements (1) | Shape`, with a green direction icon in the gutter.
- Select a related name to navigate to its declaration, or select the direction and count to open the full list.
- In a Simplified Chinese interface, the directions are `实现者` and `实现`.

These are the expected example relationships; the actual results depend on the Go language service. The extension automatically queries only visible declarations, so scroll down to inspect other types. Gutter icons require `editor.glyphMargin`, and names above declarations require `editor.codeLens`; the extension settings `goInterfaces.codeLens` and `goInterfaces.gutterIcons` are enabled by default.

You do not need to initialize a module or copy the directory. If an older window still reports import errors after `go.mod` was added, reopen this directory or run **Go: Restart Language Server** and wait for it to load.

## Run the example program

From this directory, run:

```sh
go run .
```

The program demonstrates a function adapter, shape calculations, cross-package storage, interface composition, and a generic type. Running it is optional when inspecting the extension's annotations.

## Scenarios and expected results

| File                           | Scenario                                                 | Expected result                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shapes/shapes.go`             | Value and pointer receivers                              | `Shape` shows `Circle`, `Rect`, and `Square`; each type shows `Shape`.                                                                                                       |
| `store/memory/memory.go`       | Cross-package implementation and type embedding          | `Memory` implements `Store`; `Named` implements it through embedded `Memory` and is marked `?` if the method source is unconfirmed.                                          |
| `store/memory/fake_test.go`    | Type declared in a test file                             | Filtering hides `fakeStore` when enabled and shows it when disabled.                                                                                                         |
| `stream/stream.go`             | Interface composition                                    | `Buffer` implements `Reader`, `Writer`, `Closer`, `ReadWriter`, and `ReadWriteCloser`.                                                                                       |
| `defined/types.go`             | Named functions, basic types, and slices                 | `FormatterFunc` implements `Formatter`; `Count`, `Word`, and `List` implement `Text`.                                                                                        |
| `generics/types.go`            | Generic type implementing an ordinary interface          | `Box` implements `Label` and uses a name to distinguish its contents.                                                                                                        |
| `generics/sources_test.go`     | Generic type declared in test code                       | With filtering enabled, `Label` shows `Box`; disabling filtering adds `TestBox`.                                                                                             |
| `generictypes/types.go`        | Generic collections and renamed type parameters          | `List`, `Array`, `Dict`, and `Queue` each show `Sized`; the examples include a pointer receiver, renamed parameters, and two type parameters on `Dict`.                      |
| `generictypes/types.go`        | Generic named function                                   | `Func` and `Arity` each show one relationship in both directions; query the `Func` type name.                                                                                |
| `generictypes/types.go`        | Independent and type-parameter-dependent methods         | `List` retains its `Sized` relationship, but is not shown for `FirstString` or `SizedFirstString`, even with filtering disabled.                                             |
| `generictypes/types.go`        | Methodless type and unsupported references               | `Missing` has no matches; `IntList`, `NewList`, `RefList`, and `Counter` are unsupported.                                                                                    |
| `generictypes/sources_test.go` | Generic collection declarations and methods in test code | With filtering enabled, `Sized` shows `Array`, `Dict`, `List`, and `Queue`; disabling it adds `TestList` and `TestMethodList`, for six results. None are marked unconfirmed. |

The `*_test.go` files contain declarations for manually checking test source filtering. They contain no unit test functions, and there is no need to run `go test`. After running **Go Interfaces: Toggle Test Source Filter**, check `Store` in `store/store.go` again. Whether the language service returns locations from test variants depends on its loading state, so zero results alone do not prove that no implementations exist.

## Interaction checks

The signatures of a generic type's required direct methods must not depend on its receiver type parameters. `generictypes.List.Len` meets this condition, while `First` returns a type parameter, so its relationship with `FirstString` is not displayed. Generic interfaces, generic aliases, and newly defined references remain unsupported. Generic instantiations are grouped by declaration rather than counted separately. A generic relationship is not displayed when the required method evidence is missing or exceeds the query budget.

- While typing continuously, displayed names and icons stay in place and refresh after typing stops; old names cannot be clicked during the refresh.
- A temporary syntax error in the current file preserves its previous display; syntax errors in other files count affected candidates as unreadable.
- Changing gopls build flags or environment settings immediately ends pending queries and triggers new ones.
- `goInterfaces.codeLens` and `goInterfaces.gutterIcons` can be disabled independently.
- Nested modules, vendor directories, multi-root workspaces, and remote environments require separate setup and are not covered by this example.
