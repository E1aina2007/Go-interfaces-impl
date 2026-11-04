# Go Interfaces Impl

用于查看 Go module 内接口与结构体实现关系的 VS Code 插件，视觉呈现与交互计划参考 GoLand。

当前版本完成了扩展基础框架、module 上下文与文档快照，以及 Go 分析进程的通信和生命周期。接口分析与导航尚未实现，当前仍不能查询接口实现。

业务与代码方案保存在本地 `docs/` 目录，不纳入版本控制。接口分析、导航和过滤功能将按模块逐步实现。

## 计划中的功能

- 从 struct 查看当前 Go module 内它实现的所有接口
- 从接口查看当前 Go module 内实现它的所有 struct
- 支持过滤位于引入 `testing` 包的单元测试代码中的接口实现

## 已实现的工作区基础模块

- 通过 `go env -json`、`go mod edit -json` 和 `go work edit -json` 读取 module、工作区及本地替换配置，不自行解析 Go 模块文件
- 优先使用官方 Go 扩展公开的工具路径 API，也可指定 `goInterfaces.goExecutable`
- 记录目标平台、CGO、构建 flags、Go 环境与配置文件摘要，形成编译上下文
- 捕获打开的 Go 文档内容与版本，构建未保存内容的 overlay；输入变化后旧快照失效
- 监听工作区、已发现模块及配置文件的变化，并在插件关闭时释放监听和取消模块发现

该模块供后续查询服务调用，激活插件时不会执行 Go 包加载。目前采用保守的全局快照失效策略；精确的传递依赖跟踪随分析器实现。引入 `go.mod`、`go.work` 等配置的未保存改动，以及替换输入的 `-modfile`、`-overlay`、`-C` 参数，均返回明确的不支持状态。

2026-11-04 已通过静态检查、打包和基于本机 Go SDK `std` module 的只读本地运行；该运行核对了模块元数据与文档快照捕获。VS Code 宿主中的监听事件、多 module/嵌套 module、`go.work`、未保存改动和远程环境尚未完成交互验收。

## 已实现的分析进程模块

- 独立的 `analyzer/` Go module，使用 `sourcegraph/jsonrpc2` 与 TypeScript 的 `vscode-jsonrpc` 通信，采用 stdio 与 Content-Length 消息边界
- 握手校验协议版本、分析器版本和 Go 版本范围；Go SDK 缺失、协议不匹配、异常退出和超时均传播明确错误
- 传输层将文件 URI 转换为宿主绝对路径，校验请求 ID、文档版本、UTF-16 位置与快照上下文
- 每个 module 复用一个进程，最多保留两个活动 module；构建上下文变化时先关闭旧进程，同一进程只接受一个分析请求
- 请求取消传递至 Go context，取消后两秒未响应则终止进程；`deactivate()` 等待关闭，正常退出失败时强制终止
- 根据扩展宿主的操作系统与架构选择二进制，不使用 Go 项目的 `GOOS` / `GOARCH` 选择宿主程序

激活插件只创建进程管理器，不启动分析器。后续查询服务将按需调用它；目前 `analyze` 明确返回 `analyzer-unavailable`，不产生成功空结果。运行时还不接受 `ready` 响应，其校验随语义分析模块实现。查询任务合并和缓存调度留在后续模块。

2026-11-04 已在 Windows x64 完成真实进程握手、请求响应、主动取消、复用和关闭的本地检查，并核对缺失 Go SDK、较新 Go 版本及协议不匹配的错误。Go 静态检查、两侧构建和 VSIX 打包通过；没有运行单元测试。其他平台、远程扩展宿主及编辑器退出交互尚未验收。

## 本地开发

开发环境使用 Node.js 24.15 或更新的 24.x 版本、npm、Go 1.24 或更新版本，以及 VS Code 1.110 或更新版本。`.nvmrc` 指向 Node.js 24；`package-lock.json` 和 `analyzer/go.sum` 固定依赖版本。编译器的 `GOROOT` 需要与所选 Go SDK 匹配。

```sh
npm ci
npm run build:analyzer
```

使用 VS Code 打开仓库，按 **F5** 选择 `Run Extension`。调试配置会先执行类型检查和开发构建，再启动 Extension Development Host。

在新窗口的命令面板中执行 **Go Interfaces: Show Output**；中文界面对应 **Go Interfaces: 查看输出**。输出面板中应能看到 `Extension activated`。打开 Go 文件也会触发插件激活。

需要持续构建时，在终端执行：

```sh
npm run watch
```

监听模式并行运行 esbuild 与 TypeScript 检查。修改后需要重启调试会话或在开发宿主中执行 `Developer: Reload Window` 才会加载新的扩展代码；它不提供运行时热替换。

修改 Go 源码后另行执行 `npm run build:analyzer`。此脚本只构建当前 Node 宿主平台，关闭 CGO，并隔离外层 `go.work` 和 `GOFLAGS`；可通过 `GO_INTERFACES_BUILD_GO` 指定构建用的 Go 可执行文件。握手允许的 SDK 版本范围为 Go 1.24 至分析器编译器的语言版本，此范围尚不代表语义分析功能已经可用。

## 常用命令

| 命令                     | 用途                                    |
| ------------------------ | --------------------------------------- |
| `npm run check`          | 格式检查、ESLint 和 TypeScript 类型检查 |
| `npm run format`         | 格式化源码与配置，保留现有 `AGENTS.md`  |
| `npm run compile`        | 类型检查与开发构建，生成 source map     |
| `npm run build:analyzer` | 构建当前宿主平台的 Go 分析器            |
| `npm run check:analyzer` | 对 Go 分析器执行 `go vet`               |
| `npm run watch`          | 持续构建与类型检查                      |
| `npm run build`          | 静态检查与生产构建                      |
| `npm run package`        | 执行生产构建并生成本地 VSIX             |
| `npm run package:files`  | 查看 VSIX 待打包的文件列表              |

遵循仓库约定，未配置单元测试、测试框架或测试脚本。上述静态检查与构建不代表扩展宿主中的交互已经验收。

2026-11-04 的依赖检查中，`npm audit` 报告 13 项中等等级告警，均来自开发工具链对 `minimatch` 的传递依赖，对应同一个[上游公告](https://github.com/advisories/GHSA-g3hv-75wg-m249)。这些依赖不进入 VSIX；`npm audit --omit=dev` 报告 0 项告警。后续升级开发工具时需复核此项。

## 目录与约定

```text
src/extension.ts       扩展入口、命令和资源生命周期
src/domain/            实现关系、类型和快照的领域契约
src/application/       查询请求、状态和服务契约
src/workspace/         module 解析、文档快照与宿主事件适配
src/analyzer/          进程管理、协议校验与领域适配
analyzer/              独立 Go module、stdio 服务与取消处理
scripts/               当前宿主平台的分析器构建脚本
.vscode/              F5 调试、构建任务和开发配置
.github/workflows/     Windows / Linux 静态检查与打包流程
package.json          扩展清单、命令声明和开发脚本
package.nls*.json      清单的英文及简体中文文案
esbuild.mjs            开发、监听和生产构建
eslint.config.mjs     ESLint 与 TypeScript 类型感知规则
tsconfig.json         严格类型检查及 VS Code API 类型范围
dist/                 构建产物，不纳入版本控制
```

- 扩展按 Go 文件或命令调用按需激活；没有全工作区启动扫描
- 入口使用普通函数，命令与日志通过 `context.subscriptions` 释放
- 日志使用 VS Code 自带的 `LogOutputChannel`；通过 VS Code 的日志级别操作调整详细程度
- 使用 `extensionKind: workspace`，为后续在工作区所在的扩展宿主中分析 Go 代码保留位置；远程环境仍需后续验证
- 运行时代码使用 VS Code、Node.js 标准能力、Zod Mini 和 JSON-RPC 库；Zod 校验 Go 工具元数据与协议消息
- `@types/vscode` 固定为最低支持的 API 版本，避免开发时误用较新 API
- 重要逻辑使用英文、中文各一行的注释，中文注释不使用中文句号

接口分析、过滤和结果展示会随对应功能逐步添加。

## 本地打包

```sh
npm run package
```

根目录生成 `go-interfaces-impl-0.0.1.vsix`，可通过 VS Code 的 `Extensions: Install from VSIX...` 安装。`.vscodeignore` 允许扩展入口产物、分析器二进制、清单、翻译、说明及第三方许可证进入包，源码、开发依赖和 source map 不随包分发。

当前本地 VSIX 只包含已经在 `dist/analyzer/` 中构建的宿主二进制；打包不会下载其他平台程序。跨平台发布包与远程宿主验证仍属于后续工作，不应将本机生成的包视为所有平台均可运行。

当前尚未设置 Marketplace 的 `publisher`，许可证保留为 `UNLICENSED`；本地打包使用 `--skip-license`。正式发布前需确定发布者与许可证，并调整打包配置。仓库没有自动发布流程。

## 参考来源

| 来源                                                                                                                                                                     | 采用的做法                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| [Go 扩展](https://marketplace.visualstudio.com/items?itemName=golang.Go) / [源码](https://github.com/golang/vscode-go/blob/master/extension/package.json)                | Go 语言按需激活、扩展清单组织                 |
| [ESLint 扩展](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) / [源码](https://github.com/microsoft/vscode-eslint/blob/main/package.json)    | 工作区扩展宿主声明、原生命令入口              |
| [Prettier 扩展](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) / [源码](https://github.com/prettier/prettier-vscode/blob/main/package.json) | esbuild、独立类型检查、清单本地化             |
| [VS Code 官方构建指南](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)                                                                     | 单文件打包、外置 `vscode`、区分开发与生产构建 |
| [VS Code 官方扩展生成器](https://github.com/microsoft/vscode-generator-code)                                                                                             | 标准扩展入口、开发调试与任务组织              |
| [VS Code JSON-RPC](https://github.com/microsoft/vscode-languageserver-node/tree/main/jsonrpc) / [Go JSON-RPC](https://github.com/sourcegraph/jsonrpc2)                   | 复用成熟的消息边界与连接实现                  |

仅选用当前骨架所需的做法，未引入这些项目的业务架构或测试脚手架。
