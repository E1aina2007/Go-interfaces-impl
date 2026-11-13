<p align="center">
  <img src="../media/icon.png" width="128" height="128" alt="Go Interfaces extension icon" />
</p>

<h1 align="center">Go Interfaces</h1>

<p align="center"><strong>See Go interface relationships right where you read code.</strong></p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=E1aina2007.go-interfaces-impl">VS Code Marketplace</a>
  · <a href="#features">Features</a>
  · <a href="#quick-start">Quick start</a>
  · <a href="#example">Example</a>
  · <a href="#settings">Settings</a>
  · <a href="https://github.com/E1aina2007/Go-interfaces-impl/issues">Report an issue</a>
</p>

<p align="center"><a href="../README.md">简体中文</a></p>

---

## Overview

Go uses implicit interface implementation, which makes types flexible to use but makes their relationships harder to spot. Go Interfaces places those relationships next to declarations so you can understand and navigate the code more easily.

## Features

| Capability                | Description                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Two-way lookup**        | See which interfaces a type implements, or which types implement an interface                            |
| **Inline relationships**  | View related names and direction icons near declarations, with hover details                             |
| **Fast navigation**       | Jump from a related name or open the complete result list                                                |
| **Go module scope**       | Search within the current file's Go module, excluding nested modules, vendor, and dependency directories |
| **Test source filtering** | Hide implementations that can be identified as test-related; keep uncertain results marked for review    |
| **Editor integration**    | Supports English and Simplified Chinese, as well as light and dark themes                                |

The extension currently recognizes relationships for structs, named functions, basic types, slices, arrays, maps, and channels.

Generic structs support bidirectional queries with ordinary non-empty interfaces when they have no embedded fields and the required direct methods have signatures independent of receiver type parameters. Both value and pointer receivers are supported; results share the type declaration's identity.

Built-in extension messages follow the VS Code display language: Simplified Chinese uses Chinese, English uses English, and other languages fall back to English. After changing the display language in VS Code, restart as prompted to apply it.

## Quick start

1. Install **Go Interfaces** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=E1aina2007.go-interfaces-impl).
2. Install and configure the [official Go extension](https://marketplace.visualstudio.com/items?itemName=golang.Go), including its Go SDK and gopls.
3. Open a trusted local workspace containing a Go project with a `go.mod` file.

**Requirements: VS Code 1.110 or later.**

This extension uses language information exposed through the public VS Code API. The official Go extension provides the Go SDK and language service; Go Interfaces does not ship its own Go analyzer or start and manage gopls.

## Example

The screenshot shows `Rect` implementing the `Shape` interface. It uses Simplified Chinese UI labels; in English, the CodeLens reads “Implements (1) | Shape”.

![Go Interfaces showing Rect implementing Shape in the Simplified Chinese UI](../media/examples/example.zh-cn.png)

See the [full multi-type acceptance example](../examples/acceptance/shapes/shapes.go).

## Using the extension

Open a Go file to see relationships for visible type declarations. A concrete type shows `Implements` above its declaration; an interface shows `Implemented by`. Select a related name to navigate, or select the direction and count to open the full result list. A trailing `?` means the test source could not be fully confirmed.

You can also place the cursor on a type name and run a command from the Command Palette:

- **Go Interfaces: Show Implemented Interfaces**
- **Go Interfaces: Show Implementing Types**
- **Go Interfaces: Show Type Implementation Relations**
- **Go Interfaces: Toggle Test Source Filter**

Related names above declarations are controlled by VS Code's `editor.codeLens` setting. Direction icons in the gutter require `editor.glyphMargin`. Navigate through the related names or the hover links on type names.

## Settings

| Setting                                   | Default | Description                                                |
| ----------------------------------------- | ------- | ---------------------------------------------------------- |
| `goInterfaces.hideTestingImplementations` | `true`  | Filter relationships by test source                        |
| `goInterfaces.codeLens`                   | `true`  | Show related names near type declarations                  |
| `goInterfaces.gutterIcons`                | `true`  | Show direction icons and relationship hovers in the gutter |

## Known limitations

- Results come from the definition, document symbol, and implementation features exposed by the official Go extension. They are limited by the ranges returned by the language service and may not enumerate every relationship in a module. No result does not prove that a type has no implementations.
- Value and pointer forms are not shown separately. Generic interfaces, generic aliases and defined references, promoted generic methods, parameter-dependent method signatures, empty interfaces, and type-set constraints are outside the supported scope. Generic instantiations are not counted separately. Generic relations without the necessary method evidence count as unsupported, even when test filtering is disabled.
- Test source filtering is enabled by default. A relationship is hidden when its type declaration is in a `_test.go` file that directly imports `testing`, or when a required direct method is reported only from test code. A non-test source for the same method prevents filtering on that method. The public API does not expose every package variant or promoted method source, so unresolved or promoted sources are kept and marked as uncertain.
- Queries are scoped to the nearest `go.mod` for the current file. Other modules in a `go.work` workspace are not included. Virtual and untrusted workspaces are not supported.

## Feedback and releases

Report bugs or suggest improvements on [GitHub Issues](https://github.com/E1aina2007/Go-interfaces-impl/issues). The Marketplace publisher ID is `E1aina2007`. See the [changelog](../CHANGELOG.md) for version history and the [release workflow](../.github/workflows/release.yml) for automated publishing.

## License and acknowledgements

This project is licensed under the [MIT License](../LICENSE).

The bundled Tree-sitter runtime and Go grammar resources are licensed under the MIT License:

<details>
<summary>Full third-party license texts</summary>

### @vscode/tree-sitter-wasm

    MIT License

    Copyright (c) Microsoft Corporation.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE

### Tree-sitter

    The MIT License (MIT)

    Copyright (c) 2018-2024 Max Brunsfeld

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE

### tree-sitter-go

    The MIT License (MIT)

    Copyright (c) 2014 Max Brunsfeld

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE

</details>

<details>
<summary>Project note</summary>

This project's source code was generated entirely with AI.

</details>
