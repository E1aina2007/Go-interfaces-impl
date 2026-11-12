# Go Interfaces Impl

面向 Go 语言的 VS Code 插件，用于查看当前 Go module 内具名类型与 interface 的实现关系。视觉呈现与交互参考 GoLand，在类型声明旁展示关联类型，并支持直接跳转。

> _此项目源代码完全使用AI生成。_

## 为什么做这个？

Go 语言优秀的接口隐式实现设计，让其能够在代码中被灵活地使用。但是隐式实现也带来了一定的可读性下降，对初学者来说可能不是特别友好。恰逢 AI 与 Vibe Coding 的蓬勃发展，本插件因此诞生。

## 主要功能

- **双向查询**：查看具体类型实现的接口，或查看接口的实现类型，支持 struct、具名函数、基础类型、切片、数组、map 和 channel
- **行内展示**：在类型声明上方显示可点击的关联名称，在左侧显示实现方向图标，并通过悬停查看关系与导航链接
- **结果导航**：点击关联名称直接跳转，也可打开完整结果列表进行选择
- **module 范围**：将结果限定在当前文件所属的 Go module 内，排除嵌套 module、vendor 和依赖目录
- **测试来源过滤**：按类型声明与直接方法来源过滤测试实现，对来源不完整的关系保留未确认标记
- **界面适配**：支持英文、简体中文，以及深浅色主题

## 使用要求

- VS Code 1.110 或更新版本
- 安装[官方 Go 扩展](https://github.com/golang/vscode-go)，并配置其所需的 Go SDK 与 gopls
- 在受信任的本地文件系统工作区中打开包含 `go.mod` 的 Go 项目

插件使用 TypeScript 编写，通过 VS Code 公开语言接口复用官方 Go 扩展，不包含自有 Go 分析器，也不自行启动或管理 gopls。Go SDK 与语言服务由官方 Go 扩展负责。

## 使用方式

打开 Go 文件后，插件自动查询可见类型声明的实现关系。具体类型上方显示 `Implements`，接口上方显示 `Implemented by`；点击关联名称可跳转，点击方向与数量可打开完整列表。名称后的 `?` 表示测试来源未完全确认。

也可将光标放在类型名称处，通过命令面板执行：

- **Go Interfaces: 查看实现的接口** / **Show Implemented Interfaces**
- **Go Interfaces: 查看实现接口的类型** / **Show Implementing Types**
- **Go Interfaces: 查看类型实现关系** / **Show Type Implementation Relations**
- **Go Interfaces: 切换测试来源过滤** / **Toggle Test Source Filtering**

显示上方关联名称需要启用 VS Code 的 `editor.codeLens`，显示左侧图标需要启用 `editor.glyphMargin`。左侧图标用于标识方向，导航可通过上方名称或类型名称处的悬停链接完成。

## 配置

| 配置                                      | 默认值 | 用途                                 |
| ----------------------------------------- | ------ | ------------------------------------ |
| `goInterfaces.hideTestingImplementations` | `true` | 按类型声明与直接方法来源过滤测试实现 |
| `goInterfaces.codeLens`                   | `true` | 显示类型声明上方的关联名称           |
| `goInterfaces.gutterIcons`                | `true` | 显示左侧方向图标与关系悬停           |

## 能力边界

实现关系来自官方 Go 扩展的公开 definition、document symbol 和 implementation 接口。结果受语言服务返回的位置范围限制，不保证完整枚举 module 内的所有实现关系；没有可展示结果也不代表类型不存在实现关系。值与指针形式不分别显示，泛型、空接口及类型集合约束等类型存在查询限制。

测试来源过滤默认开启：类型声明文件以 `_test.go` 结尾且直接导入 `testing` 时，隐藏对应关系；对生产文件中的具体类型，还会检查接口方法对应的直接方法来源。公开接口无法提供完整的包变体和提升方法来源，证据不足时保留关系并标记为未确认。

查询以当前文件最近的 `go.mod` 为边界，`go.work` 中的其他 module 不纳入结果。虚拟工作区与未信任工作区不启用本扩展。

## 第三方许可声明

随扩展分发的 Tree-sitter 运行时与 Go 语法资源适用以下许可。

<details>
<summary>展开查看第三方许可全文</summary>

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
SOFTWARE.

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
SOFTWARE.

</details>
