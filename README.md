# Go Interfaces Impl

用于查看当前 Go module 内 struct 与 interface 的实现关系，在类型声明行左侧显示方向图标，上方显示可点击跳转的关联类型名称，并保留原生结果列表。

插件源码使用 TypeScript，开发与打包仅需要 Node.js 和 npm，不包含自有 Go 分析器。`examples/acceptance/` 是独立的 Go module，用于人工体验插件，不参与插件构建或 VSIX 打包。语义查询通过 VS Code 的公开语言接口复用官方 Go 扩展，因此使用查询功能仍需配置该扩展的 Go SDK 与 gopls。

## 当前功能

- 在 struct 名称处执行 **Go Interfaces: 查看实现的接口** / **Show Implemented Interfaces**
- 在 interface 名称处执行 **Go Interfaces: 查看实现接口的结构体** / **Show Implementing Structs**
- 使用 **Go Interfaces: 查看类型实现关系** / **Show Type Implementation Relations** 自动选择方向，适用于类型别名与基于具名类型的新定义
- 自动查询当前编辑器可见的类型声明：struct 上方显示 `Implements (2) | Reader | Closer`，interface 上方显示 `Implemented by (2) | File | Buffer`，点击名称直接跳转
- 有匹配结果时，在声明行左侧显示方向图标；悬停类型声明名称可查看关联名称、路径与导航链接
- 原创圆角接口徽标配合方向箭头，绿色表示实现接口、蓝色表示存在实现者，自动适配深浅主题
- 上方最多显示 6 个关联名称，点击名称前的方向与数量可打开完整列表；名称后的 `?` 表示测试来源未完全确认
- 从类型引用处发起查询；编辑器右键菜单和命令面板保留两个方向的操作
- 将语言服务返回的位置限定到当前文件所属的 module，排除嵌套 module、vendor 和依赖目录；使用原生列表选择并跳转
- 支持按类型声明和已报告的直接方法位置过滤测试来源，显示隐藏数量、无法分类数量及来源未确认标记
- 查询支持取消等待；文档、工作区或配置变化后拦截过期结果，跳转前再次检查有效性
- 命令、上方名称、悬停、列表和提示文案跟随 VS Code 显示语言，提供英文与简体中文

Go 源码、module/work 配置、工作区或 `go`、`gopls`、`goInterfaces` 设置变化时，查询会过期并立即停止本插件对公开 provider 的等待；源码或设置变化显示重新查询提示，主动取消保持静默。`gopls` 设置包括影响文件选择的构建标记与环境配置。[Go 扩展设置说明](https://github.com/golang/vscode-go/blob/master/docs/settings.md#gopls)

用户已反馈旧版可以显示实现查询结果。新版在开发宿主中已核对 `schema.Memory` 的实现者名称、左侧图标以及跳转到 `ConversationBuffer`；该样例不代表全部类型、刷新与过滤场景均已验收。

左侧图标使用公开 gutter decoration API，该接口没有图标单击回调。将指针放在类型声明名称上可查看关系悬停及导航链接，上方名称支持直接单击跳转；关系悬停与图标一起受 `goInterfaces.gutterIcons` 控制。显示图标需要启用 VS Code 的 `editor.glyphMargin`，显示上方名称需要启用 `editor.codeLens`。

## 能力边界

实现关系由已安装的 Go 扩展提供。本插件使用公开的 definition、document symbol 和 implementation 命令，不访问内部 language client，不自行启动或管理 gopls。未保存 Go 文档、构建配置和包加载由 Go 扩展处理；未保存的模块配置需先保存。

公开接口仅返回位置，无法提供完整的方法集、包变体或关系来源。因此结果统一标记为语言服务提供的有限结果，不承诺 module 内实现关系的完整枚举；零项结果也只表示当前没有可展示的位置。gopls 对空方法集和部分泛型、约束类型有能力限制，值与指针形式也不会在本插件中分别显示。[公开命令契约](https://code.visualstudio.com/api/references/commands) · [gopls 实现](https://github.com/golang/tools/blob/master/gopls/internal/golang/implementation.go)

支持直接声明的 struct / interface，以及最终解析到这些类型的非泛型引用链。类型别名 `type Alias = Original` 按目标类型去重、显示与跳转；新定义 `type New Original` 保留 `New` 的身份、位置和 module 归属，只沿引用确定底层种类，其实现关系始终从原查询位置交给语言服务判断，不复用 `Original` 的实现列表。[Go 类型声明规范](https://go.dev/ref/spec#Type_declarations)

引用链通过公开 definition provider 解析，单次最多跟进 32 个声明，防止循环；有歧义或无法解析的主体明确报错，结果候选计入不支持数量。显式指针、其他复合类型、泛型声明与实例、空接口及可识别的类型集合约束仍不支持。命名类型构成的复杂约束仍依赖语言服务，无法保证精确识别。

类型别名与具名引用沿用原有公开 definition 解析规则，解析后按实际类型种类显示关联名称与方向图标。后台只查询可见声明，不扫描整个 module；打开文件、滚动及源码或配置变化后，合并 400 毫秒内的刷新事件并串行执行查询。暂未返回结果时显示查询中入口，查询失败时显示重试入口并记录日志，不把失败显示为零个实现。已查询但没有可展示匹配时不显示名称或图标。

源码或设置变化后，已显示的名称和图标会按声明名称保留到新结果返回，避免输入时反复闪烁；失效时关闭已打开的关系悬停；刷新期间重新悬停只显示只读内容，上方旧名称不可点击跳转。当前文件存在语法错误时不发起新查询，继续保留旧展示；其他候选文件存在语法错误时，只将对应候选计入摘要中的 `unreadable`，不使整次查询失败。语言服务返回的同类关系（接口之间）不属于本插件的关系范围，不计入 `unsupported`。同一 generation 内，成功的语言服务就绪检查按文件复用，失败或取消后可重试。

module 边界通过当前文件最近的 `go.mod` 和规范化后的物理路径确定，不执行 Go 命令读取环境。`go.work` 的其他 module 不进入结果；当前文件必须位于打开的文件系统工作区中。虚拟工作区与未信任工作区不启用本扩展。

本地别名指向依赖类型时，不会将该依赖类型作为本 module 的新类型计入结果；本地新定义则保留自己的归属。结果仍受语言服务返回的位置范围限制。

### 测试过滤

`goInterfaces.hideTestingImplementations` 默认开启。任一类型端点的声明文件同时满足以下条件时，隐藏对应结果：

```text
filename ends with _test.go && directly imports testing
```

导入来自 Tree-sitter 语法树，支持别名、点导入、空白导入、原始字符串及数字转义。注释、普通字符串中的 testing、testing/quick，以及同包其他文件的 import 均不触发过滤。没有直接导入 testing 的 `_test.go` 文件会保留。

对生产文件中的 struct，还会从接口自身及已展开嵌入接口的显式方法发起 implementation 查询，解析返回方法的接收者，并按规范类型身份归组。若 struct 没有匿名嵌入字段、返回的位置均能分类，某个必要方法只报告了符合上述过滤条件的来源，且没有报告可保留来源，则隐藏对应关系。找到可保留来源时会保留该方法依据；没有导入 testing 的测试辅助文件仍可作为保留依据。两种查询方向复用这一规则。[gopls 方法实现查询](https://github.com/golang/tools/blob/master/gopls/internal/golang/implementation.go)

支持展开非泛型具名接口嵌入，包括跨包引用及别名链，例如 `interface { io.Reader; io.Closer }`。相同方法声明按规范文件位置去重；同名但来自不同声明的方法分别保留，不自行比较方法签名。每次过滤最多尝试解析 64 个嵌入引用，并对当前展开路径使用 32 层保护；仅在当前查询内缓存无未解析分支的展开结果。[Go 嵌入接口规范](https://go.dev/ref/spec#Embedded_interfaces)

包含匿名嵌入字段的 struct 会保留并标记来源未确认，避免测试变体的直接方法掩盖有效的生产提升方法。无法完整展开的接口嵌入、无法解析的接收者、未定位到的方法以及超出预算的来源也保留并标记；有已知必要方法能够按上述规则过滤时，仍会隐藏该关系。结果项详情和列表顶部显示来源未确认状态。展开只收集方法位置，不代表已经追踪嵌入声明、方法签名引用等完整测试来源链。

每次查询最多执行 32 个方法实现查询、检查 256 个本 module 方法位置，相同方法位置在当前查询内复用；关闭过滤时不会执行这些额外查询。公开接口仍不提供完整包变体或来源覆盖保证，因此未确认数量为零也不代表已经精确覆盖所有实现关系。当前尚不追踪完整的提升方法来源链。

具名目标的别名使用目标类型的声明文件进行过滤，别名本身不增加实现关系依据；新定义使用自身的声明文件。

通过 **Go Interfaces: 切换测试来源过滤** 或设置页修改开关。命令只修改活动文件所属工作区文件夹的配置。

## 本地开发

需要 Node.js 24.15 或更新的 24.x 版本、npm 和 VS Code 1.110 或更新版本。`.nvmrc` 指向 Node.js 24，锁文件固定依赖版本。

```sh
npm ci
npm run compile
```

使用 VS Code 打开仓库，选择 **Run Extension (Acceptance Examples)** 并按 **F5**。开发宿主会直接打开已初始化的 `examples/acceptance/` module 和 `shapes/shapes.go`；等待 Go 语言服务就绪后，`Shape` 声明上方应显示 `Circle`、`Rect`、`Square`，左侧显示实现方向图标。完整操作与过滤场景见 [示例说明](examples/acceptance/README.md)。

开发宿主需要官方 Go 扩展 `golang.go`，扩展清单已声明该依赖。选择 **Run Extension** 可以打开其他已有 Go module，并从类型名称处执行查询。仅安装 VSIX 时，也可直接用 VS Code 打开 `examples/acceptance/` 文件夹体验，无需复制目录或下载本仓库的 Go 包。

**Go Interfaces: 查看输出** / **Show Output** 可查看日志。修改插件代码后重新加载开发宿主；`npm run watch` 会持续进行 TypeScript 检查和开发构建，不提供运行时热替换。

| 命令                    | 用途                                    |
| ----------------------- | --------------------------------------- |
| `npm run check`         | 格式检查、ESLint 和 TypeScript 类型检查 |
| `npm run format`        | 格式化源码与配置，保留 AGENTS.md        |
| `npm run compile`       | 类型检查与开发构建                      |
| `npm run watch`         | 持续构建与类型检查                      |
| `npm run build`         | 静态检查与生产构建                      |
| `npm run package`       | 生产构建并生成 VSIX                     |
| `npm run package:files` | 检查打包清单                            |

打包过程只复制 `@vscode/tree-sitter-wasm` 发布的运行时和 Go 语法 WASM，不执行解析器编译或任何 Go 工具命令。公共 provider 命令没有底层取消参数，取消会停止本插件的等待与展示；已经提交给 Go 扩展的任务由该扩展管理。语言接口单次等待上限为 60 秒。

## 配置

| 配置                                      | 默认值 | 用途                                 |
| ----------------------------------------- | ------ | ------------------------------------ |
| `goInterfaces.hideTestingImplementations` | `true` | 按上述声明与直接方法规则过滤测试来源 |
| `goInterfaces.codeLens`                   | `true` | 自动显示类型声明上方的关联名称       |
| `goInterfaces.gutterIcons`                | `true` | 显示声明行左侧的实现方向图标         |

名称与图标共用同一份已过滤查询结果。源码、工作区和相关设置变化时，旧查询立即失效，按声明保留旧名称和图标作为只读展示，再重新查询可见声明；切换文件后释放隐藏文档的展示缓存。刷新期间旧名称不绑定跳转命令，重新请求的关系悬停不包含导航链接；导航入口在跳转前检查结果有效性。计数只表示当前 provider 返回的可展示结果，不表示完整实现数量。

## 目录与验证

```text
src/core/              TypeScript 数据与 Tree-sitter 语法读取
src/workspace/         文件规范化、module 边界与归属
src/language/          VS Code 公开语言接口适配
src/query/             查询协调、版本校验、范围与过滤
src/presentation/      命令、结果导航与 CodeLens
media/                 左侧实现方向 SVG 图标
l10n/                  运行期界面文案的简体中文翻译
examples/acceptance/   可直接打开与运行的独立 Go module，不进入 VSIX
src/extension.ts       入口与资源释放
.vscode/               F5 调试与构建任务
.github/workflows/     Windows / Linux 的 Node.js 检查和打包
esbuild.mjs            扩展构建与两份 WASM 资源复制
```

2026-11-04 已完成格式检查、ESLint、类型检查、生产构建和 VSIX 打包。使用现有 Go 源文件进行了只读语法运行，核对类型声明、导入识别、名称偏移与 module 归属，没有调用 Go 工具。未编写或运行单元测试。

别名解析切片已通过格式、lint、类型检查及打包；使用现有 `os/types.go` 与 `net/http/serve_test.go` 核对别名标记、具名引用分类、目标名称偏移和不支持类型分类。此运行仅验证语法元数据；跨包 definition 链、循环或歧义处理、别名去重、module 二次过滤和新定义的方法语义尚未在扩展宿主中验收。

直接方法来源切片使用现有 `io/io.go`、`io/io_test.go`、`net/http/server.go` 只读核对接口成员、具体方法、接收者、名称偏移与嵌入字段标记；没有调用 Go 工具。公开方法查询、接收者 definition、生产与测试来源混合、预算耗尽和取消等交互仍待宿主验收，没有编写或运行单元测试。

组合接口切片已通过格式、lint、类型检查及打包。只读解析 `io/io.go`、`io/fs/fs.go`、`net/http/fs.go` 和 `cmp/cmp.go`，核对本地与限定名嵌入目标偏移，以及不支持元素的保留标记；该运行只检查语法元数据，未执行公开 definition 链。递归展开、菱形去重、循环、预算耗尽及其过滤效果仍待扩展宿主验收，本轮未编写或运行单元测试，也未调用 Go 工具。

2026-11-05 补齐 `gopls` 配置变更监听，并在查询失效时取消内部等待，保留过期提示与主动取消的区别。该行为仍需在扩展宿主中核对，尤其是 provider 等待期间修改源码、构建标记及环境配置的情况。

2026-11-06 编辑期稳定性切片（0.0.4）通过格式、lint、类型检查、生产构建和 VSIX 打包。输入时保留旧展示、过期名称不可点击、语法错误降级和就绪检查复用尚需在扩展宿主中按 [examples/acceptance](examples/acceptance/README.md) 核对；未编写或运行单元测试，未调用 Go 工具。

2026-11-09 导航保护切片（0.0.6）补齐独立查询列表在打开目标文档后的取消与过期检查。真实开发宿主中核对了名称与图标、名称跳转、命令列表跨包跳转，以及中文名称、结果摘要和过期提示；单次临时语法错误下旧名称保持只读，撤销后恢复查询。过滤开关在 0.0.5 基线上核对为 5 / 7 项，0.0.6 中文宿主再次确认过滤开启时的 5 项及未确认提示。示例目录的 `go run .` 运行成功，未编写或运行单元测试。打开目标瞬间发生变化的竞态、连续输入稳定性、候选文件语法错误、取消等待与复杂工作区仍待专项验收。

2026-11-10 悬停保护切片（0.0.7）将关系悬停改为通过公开 HoverProvider 按需生成，失效时关闭旧弹层，图标继续跟随编辑。修正命令链接参数的 URI 序列化，保留 Windows 文件 URI、百分号转义及类型身份。中文宿主核对了旧弹层关闭、只读悬停、插入两行时图标同步移动、撤销恢复，以及实际点击关联名称和完整列表后的导航；图标与悬停开关、关闭上方名称后仍保留图标和悬停的场景也已核对。没有编写或运行单元测试，未调用 Go 工具。

历史运行依赖审计 `npm audit --omit=dev` 为 0 项告警，开发工具链存在 minimatch 的上游告警；本轮未重新审计依赖，开发依赖不进入 VSIX。已核对的有限宿主样例不代表双向查询、测试过滤、导航、取消、多 module 和远程环境均已通过，本地静态检查也不替代这些证据。

业务设计与模块计划位于被忽略的本地 `docs/`，不会纳入提交。

## 本地打包

```sh
npm run package
```

生成 `go-interfaces-impl-0.0.7.vsix`，通过 **Extensions: Install from VSIX...** 安装。允许列表只包含入口 JS、两份 WASM、四份原创 SVG 图标（两个方向各含深浅主题版本）、清单、清单翻译与运行期翻译，以及包含第三方许可说明的 README，不包含 Go 可执行文件、源码、开发依赖或 source map。

当前未设置 Marketplace publisher，许可证保留为 `UNLICENSED`；本地打包使用 `--skip-license`。正式发布前仍需确定发布者与许可证。

## 参考来源

- [官方 Go 扩展](https://github.com/golang/vscode-go)：复用现有 Go 语言服务
- [VS Code 公开命令](https://code.visualstudio.com/api/references/commands)：definition、implementation 和 document symbol；[悬停命令链接](https://code.visualstudio.com/api/extension-guides/command#command-uris) 用于类型名称处的关系导航
- [Tree-sitter WASM](https://github.com/microsoft/vscode-tree-sitter-wasm)：预构建的语法运行时和 Go 语法
- [ESLint](https://github.com/microsoft/vscode-eslint) / [Prettier](https://github.com/prettier/prettier-vscode)：沿用初始化时参考的扩展组织和工具链做法

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
