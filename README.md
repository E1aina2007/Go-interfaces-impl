# Go Interfaces Impl

用于查看当前 Go module 内 struct 与 interface 的实现关系，并提供声明上方的 CodeLens、原生结果列表和跳转。

插件源码使用 TypeScript。开发与打包仅需要 Node.js 和 npm；仓库不包含 Go 源码、Go module、自有分析器或 Go 构建检查。语义查询通过 VS Code 的公开语言接口复用官方 Go 扩展，因此使用查询功能仍需配置该扩展的 Go SDK 与 gopls。

## 当前功能

- 在 struct 名称处执行 **Go Interfaces: 查看实现的接口** / **Show Implemented Interfaces**
- 在 interface 名称处执行 **Go Interfaces: 查看实现接口的结构体** / **Show Implementing Structs**
- 从类型引用处发起查询，或点击声明上方的 CodeLens；编辑器右键菜单也提供两个方向的操作
- 将语言服务返回的位置限定到当前文件所属的 module，排除嵌套 module、vendor 和依赖目录；使用原生列表选择并跳转
- 支持按声明文件过滤测试来源，显示隐藏数量与无法分类的结果数量
- 查询支持取消等待；文档、工作区或配置变化后拦截过期结果，跳转前再次检查有效性

这些是已接入的代码链路，真实 VS Code 扩展宿主中的查询、跳转与 CodeLens 交互尚未完成人工验收。

## 能力边界

实现关系由已安装的 Go 扩展提供。本插件使用公开的 definition、document symbol 和 implementation 命令，不访问内部 language client，不自行启动或管理 gopls。未保存 Go 文档、构建配置和包加载由 Go 扩展处理；未保存的模块配置需先保存。

公开接口仅返回位置，无法提供完整的方法集、包变体或关系来源。因此结果统一标记为语言服务提供的有限结果，不承诺 module 内实现关系的完整枚举；零项结果也只表示当前没有可展示的位置。gopls 对空方法集和部分泛型、约束类型有能力限制，值与指针形式也不会在本插件中分别显示。[公开命令契约](https://code.visualstudio.com/api/references/commands) · [gopls 实现](https://github.com/golang/tools/blob/master/gopls/internal/golang/implementation.go)

当前仅分类源码中直接声明为 struct / interface 的类型，包括直接使用字面类型的别名。引用其他具名类型的别名与新定义类型尚未解析；泛型声明、空接口及可识别的类型集合约束会被拒绝或跳过。命名类型构成的复杂约束仍依赖语言服务，无法保证精确识别。

module 边界通过当前文件最近的 `go.mod` 和规范化后的物理路径确定，不执行 Go 命令读取环境。`go.work` 的其他 module 不进入结果；当前文件必须位于打开的文件系统工作区中。虚拟工作区与未信任工作区不启用本扩展。

### 测试过滤

`goInterfaces.hideTestingImplementations` 默认开启。任一类型端点的声明文件同时满足以下条件时，隐藏对应结果：

```text
filename ends with _test.go && directly imports testing
```

导入来自 Tree-sitter 语法树，支持别名、点导入、空白导入、原始字符串及数字转义。注释、普通字符串中的 testing、testing/quick，以及同包其他文件的 import 均不触发过滤。没有直接导入 testing 的 `_test.go` 文件会保留。

**过滤只检查类型声明文件。** 生产文件中的 struct 若仅通过测试文件中的方法实现接口，公共语言接口无法返回这份方法来源，本插件无法精确过滤该关系。当前也不追踪嵌入方法的完整来源链。

通过 **Go Interfaces: 切换按声明文件过滤测试实现** 或设置页修改开关。命令只修改活动文件所属工作区文件夹的配置。

## 本地开发

需要 Node.js 24.15 或更新的 24.x 版本、npm 和 VS Code 1.110 或更新版本。`.nvmrc` 指向 Node.js 24，锁文件固定依赖版本。

```sh
npm ci
npm run compile
```

使用 VS Code 打开仓库并按 **F5**。开发宿主需要官方 Go 扩展 `golang.go`，扩展清单已声明该依赖；打开已有 Go module，等待 Go 语言服务就绪后，将光标放在类型名称上执行查询。

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

| 配置                                      | 默认值 | 用途                           |
| ----------------------------------------- | ------ | ------------------------------ |
| `goInterfaces.hideTestingImplementations` | `true` | 按上述声明文件规则过滤测试来源 |
| `goInterfaces.codeLens`                   | `true` | 显示类型声明上方的查询入口     |

CodeLens 按需读取当前文档语法，不预先扫描整个 module，也不展示未经查询的实现数量。

## 目录与验证

```text
src/core/              TypeScript 数据与 Tree-sitter 语法读取
src/workspace/         文件规范化、module 边界与归属
src/language/          VS Code 公开语言接口适配
src/query/             查询协调、版本校验、范围与过滤
src/presentation/      命令、结果导航与 CodeLens
src/extension.ts       入口与资源释放
.vscode/               F5 调试与构建任务
.github/workflows/     Windows / Linux 的 Node.js 检查和打包
esbuild.mjs            扩展构建与两份 WASM 资源复制
THIRD_PARTY_NOTICES.md  随包分发的第三方许可证
```

2026-11-04 已完成格式检查、ESLint、类型检查、生产构建和 VSIX 打包。使用现有 Go 源文件进行了只读语法运行，核对类型声明、导入识别、名称偏移与 module 归属，没有调用 Go 工具。未编写或运行单元测试。

运行依赖审计 `npm audit --omit=dev` 为 0 项告警。原有开发工具链仍有 minimatch 的上游告警；开发依赖不进入 VSIX。宿主中的双向查询、测试过滤、导航、取消，以及多 module、远程环境仍需人工验收；本地静态检查不替代这些证据。

业务设计与模块计划位于被忽略的本地 `docs/`，不会纳入提交。

## 本地打包

```sh
npm run package
```

生成 `go-interfaces-impl-0.0.1.vsix`，通过 **Extensions: Install from VSIX...** 安装。允许列表只包含入口 JS、两份 WASM、清单、翻译、README 与许可证，不包含 Go 可执行文件、源码、开发依赖或 source map。

当前未设置 Marketplace publisher，许可证保留为 `UNLICENSED`；本地打包使用 `--skip-license`。正式发布前仍需确定发布者与许可证。

## 参考来源

- [官方 Go 扩展](https://github.com/golang/vscode-go)：复用现有 Go 语言服务
- [VS Code 公开命令](https://code.visualstudio.com/api/references/commands)：definition、implementation 和 document symbol
- [Tree-sitter WASM](https://github.com/microsoft/vscode-tree-sitter-wasm)：预构建的语法运行时和 Go 语法
- [ESLint](https://github.com/microsoft/vscode-eslint) / [Prettier](https://github.com/prettier/prettier-vscode)：沿用初始化时参考的扩展组织和工具链做法
