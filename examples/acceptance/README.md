# 人工验收示例

本目录提供用于在扩展宿主中人工核对实现关系的 Go 源码。按仓库约定，这里不初始化 Go 项目：不包含 `go.mod`、`go.sum` 或 `go.work`，也不执行任何 Go 命令。示例不进入 VSIX，也不参与本仓库的检查与打包。

## 准备

插件只在最近的 `go.mod` 所界定的 module 内工作，因此需要在仓库外准备副本：

1. 将 `examples/acceptance` 复制到仓库外的目录
2. 在副本根目录自行创建 `go.mod`，module 路径必须为 `goifaces.example/acceptance`，Go 版本不低于 1.18
3. 用 VS Code 开发宿主（F5）打开该副本，等待官方 Go 扩展和 gopls 就绪

仓库的 `.gitignore` 也忽略了 `examples/` 下的 module 配置，防止误提交。

## 场景与预期

| 文件                          | 场景                         | 预期                                                                    |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `shapes/shapes.go`            | 直接声明、值与指针接收者     | `Shape` 显示 `Circle`、`Rect`、`Square`；三个 struct 各自显示 `Shape`   |
| `shapes/shapes.go`            | 别名与具名类型定义           | `Figure` 等同 `Shape`；`Box` 等同 `Rect`；`Tile` 和 `Plain` 不显示      |
| `shapes/unsupported.go`       | 空接口、约束、泛型、复合类型 | 全部不显示名称与图标                                                    |
| `stream/stream.go`            | 嵌入接口与菱形嵌入           | `ReadWriteCloser` 只显示 `File`；`Reader` 显示 `File`、`Pipe`、`Source` |
| `reset/reset.go`              | 不同声明的同名方法           | `Machine` 显示 `Both`、`Clearer`、`Resetter`                            |
| `store/memory/memory.go`      | 跨包实现、跨包别名           | `Memory` 显示 `Store`；`Local` 解析为 `Store`                           |
| `store/memory/memory.go`      | struct 匿名嵌入              | `Embedded` 保留并带 `?` 标记                                            |
| `store/memory/partial*.go`    | 必要方法仅在测试文件中       | 过滤开启时 `Store` 不显示 `Partial`，关闭后显示                         |
| `store/memory/fake_test.go`   | 测试文件声明的类型           | 过滤开启时隐藏 `fakeStore`                                              |
| `store/memory/helper_test.go` | `_test.go` 未导入 testing    | `helperStore` 保留                                                      |
| `store/memory/quick_test.go`  | 仅导入 `testing/quick`       | `quickStore` 保留                                                       |

## 交互检查

- 连续输入时，已显示的名称和图标保持不变，输入停止后刷新；刷新期间旧名称不可点击
- 制造临时语法错误时，当前文件保留旧展示；其他文件的语法错误只让相关候选计入无法读取数量
- 修改 `gopls` 构建标记或环境设置后，正在等待的查询立即结束并重新查询
- `goInterfaces.codeLens`、`goInterfaces.gutterIcons` 可以分别关闭
- 嵌套 module、vendor、多工作区文件夹以及远程环境需另行准备，本示例不覆盖
