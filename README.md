<p align="center">
  <img src="media/icon.png" width="128" height="128" alt="Go Interfaces 插件图标" />
</p>

<h1 align="center">Go Interfaces</h1>

<p align="center"><strong>把 Go 的隐式接口实现关系，直接带到代码旁。</strong></p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=E1aina2007.go-interfaces-impl">VS Code Marketplace</a>
  · <a href="#主要功能">主要功能</a>
  · <a href="#快速开始">快速开始</a>
  · <a href="#配置">配置</a>
  · <a href="https://github.com/E1aina2007/Go-interfaces-impl/issues">问题反馈</a>
</p>

<p align="center"><a href="readme/README.en.md">Read in English →</a></p>

---

## 项目简介

Go 的 interface 采用隐式实现。Go Interfaces 将类型与接口之间的关系展示在声明旁，便于理解代码并快速跳转。交互方式参考 GoLand。

## 主要功能

| 能力             | 说明                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| **双向查询**     | 查看某个类型实现了哪些接口，或某个接口由哪些类型实现                      |
| **行内关系**     | 在类型声明附近显示关联名称和方向图标，并提供悬停信息                      |
| **快速导航**     | 点击关联名称跳转，或打开完整结果列表进行选择                              |
| **module 范围**  | 以当前文件所属的 Go module 为查询范围，排除嵌套 module、vendor 和依赖目录 |
| **测试来源过滤** | 隐藏可确认来自测试代码的实现；来源不完整时保留关系并标记未确认            |
| **界面适配**     | 支持简体中文、英文以及深色和浅色主题                                      |

当前支持 struct、具名函数、基础类型、切片、数组、map 和 channel 与 interface 的实现关系。

## 快速开始

1. 从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=E1aina2007.go-interfaces-impl) 安装 **Go Interfaces**。
2. 安装并配置[官方 Go 扩展](https://marketplace.visualstudio.com/items?itemName=golang.Go)，包括 Go SDK 和 gopls。
3. 在受信任的本地工作区中打开包含 <code>go.mod</code> 的 Go 项目。

**要求：VS Code 1.110 或更新版本。**

本插件通过 VS Code 公开语言接口复用官方 Go 扩展提供的信息，不包含自有 Go 分析器，也不会自行启动或管理 gopls。

## 使用方式

打开 Go 文件后，插件会查询当前文件中可见类型声明的实现关系。具体类型上方显示 <code>Implements</code>，接口上方显示 <code>Implemented by</code>。点击关联名称可跳转；点击关系方向与数量可打开完整列表。名称后的 <code>?</code> 表示测试来源未能完全确认。

也可以将光标放在类型名称上，通过命令面板运行：

- **Go Interfaces: 查看实现的接口** / **Show Implemented Interfaces**
- **Go Interfaces: 查看实现接口的类型** / **Show Implementing Types**
- **Go Interfaces: 查看类型实现关系** / **Show Type Implementation Relations**
- **Go Interfaces: 切换测试来源过滤** / **Toggle Test Source Filter**

上方关联名称由 VS Code 的 <code>editor.codeLens</code> 控制；左侧方向图标由 <code>editor.glyphMargin</code> 控制。关系导航可使用上方名称或类型名称处的悬停链接。

## 配置

| 设置                                                 | 默认值            | 说明                           |
| ---------------------------------------------------- | ----------------- | ------------------------------ |
| <code>goInterfaces.hideTestingImplementations</code> | <code>true</code> | 按测试来源过滤实现关系         |
| <code>goInterfaces.codeLens</code>                   | <code>true</code> | 显示类型声明附近的关联名称     |
| <code>goInterfaces.gutterIcons</code>                | <code>true</code> | 显示左侧方向图标和关系悬停信息 |

## 能力边界

- 实现关系来自官方 Go 扩展公开的 definition、document symbol 和 implementation 接口。结果受语言服务返回范围限制，不保证完整枚举 module 内所有关系；没有结果也不能证明类型没有实现接口。
- 值类型和指针类型不分别展示。泛型、空接口及类型集合约束等场景存在查询限制。
- 测试来源过滤默认开启。若类型声明位于直接导入 <code>testing</code> 的 <code>_test.go</code> 文件，会隐藏对应关系；若生产类型所需的直接方法只报告为测试来源，也会过滤。同一方法若存在非测试来源，不会仅因测试来源而过滤。公开接口无法完整提供包变体或提升方法来源，因此无法解析或涉及提升方法的关系会保留并标记未确认。
- 查询以当前文件最近的 <code>go.mod</code> 为边界；<code>go.work</code> 中的其他 module 不纳入结果。虚拟工作区与未信任工作区不启用本插件。

## 反馈与版本

欢迎通过 [GitHub Issues](https://github.com/E1aina2007/Go-interfaces-impl/issues) 提交问题或建议。发布者 ID 为 <code>E1aina2007</code>；版本记录见 [CHANGELOG](CHANGELOG.md)，自动发布流程见 [Release 工作流](.github/workflows/release.yml)。

## 许可与致谢

本项目采用 [MIT License](LICENSE)。

随插件分发的 Tree-sitter 运行时与 Go 语法资源采用 MIT License：

<details>
<summary>第三方许可证全文</summary>

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
<summary>项目说明</summary>

本项目源代码完全由 AI 生成。

</details>
