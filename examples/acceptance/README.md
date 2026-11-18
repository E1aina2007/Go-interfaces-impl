# Go 接口实现关系示例

[Read in English](README.en.md)

本目录是可直接打开的独立 Go module，包含 `go.mod`，只使用 Go 标准库。module 路径为 `github.com/E1aina2007/Go-interfaces-impl/examples/acceptance`，跨包导入均指向本目录内的源码，不需要从 GitHub 下载，也不需要设置 `replace`、`GOPATH` 或 `go.work`。示例源码和 module 配置不进入 VSIX，不参与插件构建。

## 直接查看插件效果

开发插件时，在仓库根目录执行 `npm ci`，然后在 VS Code 的运行和调试面板选择 **Run Extension (Acceptance Examples)**，按 **F5**。该配置会编译插件，并在开发宿主中打开本目录和 `shapes/shapes.go`。

已安装 VSIX 时，直接用 VS Code 打开本目录即可：

```sh
code examples/acceptance
```

需要安装并配置官方 Go 扩展 `golang.go` 和其所需的 Go SDK、gopls。信任工作区，等待语言服务加载完成后，打开 `shapes/shapes.go`，将 `Shape`、`Rect` 等声明滚动到可见区域：

- `Shape` 上方显示 `实现者 (3) | Circle | Rect | Square`，左侧显示蓝色方向图标
- `Rect` 上方显示 `实现 (1) | Shape`，左侧显示绿色方向图标
- 点击关联名称跳到对应声明，点击方向和数量打开完整列表
- 英文显示语言下，方向分别为 `Implemented by` 和 `Implements`

这些是示例的预期关系，实际返回范围仍受 Go 语言服务限制。插件只自动查询当前可见声明，向下滚动可查看其他类型。左侧图标需要启用 `editor.glyphMargin`，上方名称需要启用 `editor.codeLens`；插件的 `goInterfaces.codeLens` 和 `goInterfaces.gutterIcons` 默认开启。

无需手动初始化 module 或复制目录。若刚新增 `go.mod` 后旧窗口仍显示导入错误，重新打开本目录，或执行 **Go: Restart Language Server** 后等待加载。

## 运行示例程序

在本目录执行：

```sh
go run .
```

程序演示函数适配器、形状计算、跨包存储、组合接口和泛型类型。这一步只用于运行 Go 示例，查看插件标记时无需运行程序。

## 场景与预期

| 文件                           | 场景                         | 预期                                                                                        |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `shapes/shapes.go`             | 值与指针接收者               | `Shape` 显示 `Circle`、`Rect`、`Square`；三个类型各自显示 `Shape`                           |
| `store/memory/memory.go`       | 跨包实现与类型嵌入           | `Memory` 实现 `Store`；`Named` 通过嵌入 `Memory` 实现，方法来源未确认时带 `?` 标记          |
| `store/memory/fake_test.go`    | 测试文件声明的类型           | 从普通文件查询时按开关隐藏或显示 `fakeStore`；从测试文件查询时始终保留                      |
| `stream/stream.go`             | 接口组合                     | `Buffer` 实现 `Reader`、`Writer`、`Closer`、`ReadWriter` 和 `ReadWriteCloser`               |
| `defined/types.go`             | 具名函数、基础类型与切片     | `FormatterFunc` 实现 `Formatter`；`Count`、`Word`、`List` 实现 `Text`                       |
| `generics/types.go`            | 泛型类型实现普通接口         | `Box` 实现 `Label`，通过名称区分不同内容                                                    |
| `generics/sources_test.go`     | 泛型类型的测试声明来源       | 从普通文件查询 Label 时按开关显示 Box 或 Box / TestBox；测试文件中的 Label 引用始终保留两者 |
| `generictypes/types.go`        | 泛型集合与参数改名           | List、Array、Dict、Queue 均返回 Sized；覆盖指针接收者、改名及 Dict 的两个类型参数           |
| `generictypes/types.go`        | 泛型具名函数                 | Func 与 Arity 双向各一项，查询入口为 Func 类型名称                                          |
| `generictypes/types.go`        | 安全与依赖参数的方法并存     | List 保留 Sized，但 FirstString、SizedFirstString 均不显示 List；关闭过滤也不放行           |
| `generictypes/types.go`        | 无方法与不支持的引用         | Missing 无匹配；IntList、NewList、RefList、Counter 不支持                                   |
| `generictypes/sources_test.go` | 泛型集合的测试声明与方法来源 | 普通文件中的 Sized 按开关返回 4 / 6 项；测试文件中的 Sized 引用始终保留 6 项，无未确认标记  |

`*_test.go` 是人工核对测试来源过滤的声明样例，不包含单元测试函数，也无需执行 `go test`。切换 **Go Interfaces: 切换测试来源过滤** 后，在 `store/store.go` 的 `Store` 上重新查看结果；语言服务是否返回测试变体位置取决于当前加载状态，不能仅凭零项结果认定不存在实现。

### 测试查询上下文

`testingrelations/` 专门核对测试来源边界，方法名采用 TestScope 前缀以避免影响其他样例。下面是计划预期，实际验收记录见本地交接文档：

| 查询位置                                                              | 预期                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `types.go` 的 Token，过滤开启                                         | 保留 Item、Helper、Embedded，隐藏 LocalItem 和 ExternalItem；Embedded 保持来源未确认                                    |
| `helpers.go` 的 Helper                                                | 即使该普通文件导入 testing，也保留 Token 关系                                                                           |
| `types.go` 的 Resettable                                              | Item 的必要方法只存在于测试文件，过滤开启隐藏，关闭恢复                                                                 |
| `sources_test.go` 的 LocalToken、LocalItem                            | 文件不导入 testing，仍按测试上下文保留关系；LocalToken 可查看普通类型实现                                               |
| `sources_test.go` 的 Item 引用或 ItemAlias                            | 原始查询来自测试文件，允许显示 Token、Resettable、LocalToken 等实际 provider 返回关系，不把 Item 的生产声明改成测试声明 |
| `external_test.go` 的 ExternalToken、ExternalItem、生产类型引用或别名 | 外部测试包的合法关系保留；不为其他包的类型新增方法                                                                      |
| 普通与测试文件分栏显示、切换过滤设置                                  | 普通文件标注随开关变化，测试文件保留测试关系；旧命令失效，摘要反映各自实际过滤状态                                      |

过滤关闭时，两种文件均保留测试关系。测试上下文不放宽泛型和 module 边界；生产声明不因测试文件中的引用或别名增加独立身份。普通构建不编译 `_test.go`，这些声明还需在宿主核对诊断与公开 provider 结果。

## 交互检查

泛型类型的必要直接方法签名须不依赖接收者类型参数。`generictypes.List` 的 `Len` 满足这一条件，而 `First` 的返回类型依赖类型参数，因此与 `FirstString` 的关系不显示。泛型接口、泛型别名和新定义引用仍不支持；泛型实例按声明归并，不单独计数。必要方法证据缺失或超出查询预算时，不显示该泛型关系。

- 连续输入时，已显示的名称和图标保持不变，输入停止后刷新；刷新期间旧名称不可点击
- 制造临时语法错误时，当前文件保留旧展示；其他文件的语法错误只让相关候选计入无法读取数量
- 修改 `gopls` 构建标记或环境设置后，正在等待的查询立即结束并重新查询
- `goInterfaces.codeLens`、`goInterfaces.gutterIcons` 可以分别关闭
- 嵌套 module、vendor、多工作区文件夹以及远程环境需另行准备，本示例不覆盖
