# Go 接口实现关系示例

[Read in English](README.en.md)

本目录是独立的 Go module，可在目录内运行 `go run .`。

在仓库根目录执行 `npm ci` 后，在 VS Code 中选择 **Run Extension (Acceptance Examples)** 并按 **F5**。已安装插件时，可直接用 `code examples/acceptance` 打开本目录。配置好官方 Go 扩展 `golang.go`、Go SDK 和 gopls，等待语言服务加载。

点击类型声明上方的关联名称可跳转，点击方向和数量可打开列表。上方名称需要启用 `editor.codeLens`，左侧图标需要启用 `editor.glyphMargin`。查询结果取决于语言服务返回的位置。

## 各类实现

| 文件                                   | 查询示例                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| [shapes/shapes.go](shapes/shapes.go)   | 查询 `Shape` 的三个实现。`Rect` 和 `Square` 使用值接收者，`Circle` 使用指针接收者 |
| [store/store.go](store/store.go)       | 查询 `store.Store` 可看到 `cache.Memory` 和 `memory.Memory`                       |
| [stream/stream.go](stream/stream.go)   | `ReadWriter` 组合 `Reader` 和 `Writer`，`Buffer` 通过嵌入 `bytes.Buffer` 实现     |
| [defined/types.go](defined/types.go)   | `FormatterFunc` 将普通函数适配为 `Formatter`                                      |
| [generics/types.go](generics/types.go) | 泛型结构体 `Box[T]` 实现 `Label`                                                  |

在 [memory/memory.go](store/memory/memory.go) 的 `Memory` 声明上方点击 `cache.Store` 和 `store.Store`，可以分别跳到 [cache 包的接口](store/cache/cache.go) 和 [store 包的接口](store/store.go)。悬停链接和完整列表也使用相同的名称。

在 [stream.go](stream/stream.go) 的 `Reader` 上方查看本模块的 `stream.Buffer`。如果语言服务返回 `bytes.Buffer`，点击「查看全部结果」可在标准库组找到它。切到其他文件再切回时，缓存中的本模块关系会直接显示。

## 测试来源过滤

1. 在 [store.go](store/store.go) 查询 `Store`。默认开启过滤，列表显示 `cache.Memory` 和 `memory.Memory`。
2. 执行 **Go Interfaces: 切换测试来源过滤** 关闭过滤，再查询 `Store`。列表会增加测试文件里的 `memory.fakeStore`。
3. 重新开启过滤。在 [fake_test.go](store/memory/fake_test.go) 中把光标放在 `Store` 引用上，执行 **Go Interfaces: 查看实现接口的类型**。这次从测试文件发起查询，两个普通实现和 `memory.fakeStore` 都会显示。
