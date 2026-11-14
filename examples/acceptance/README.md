# Go 接口实现关系示例

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

程序演示函数适配器、形状计算、跨包存储、组合接口和同名方法接口。这一步只用于运行 Go 示例，查看插件标记时无需运行程序。

## 场景与预期

| 文件                            | 场景                         | 预期                                                                                                          |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `shapes/shapes.go`              | 直接声明、值与指针接收者     | `Shape` 显示 `Circle`、`Rect`、`Square`；三个 struct 各自显示 `Shape`                                         |
| `shapes/shapes.go`              | 别名与具名类型定义           | `Figure` 等同 `Shape`；`Box` 等同 `Rect`；`Tile` 和 `Plain` 不显示                                            |
| `shapes/pointers.go`            | 一级指针别名与普通别名链     | RectPointer、RectPointerAlias、RectPointerViaBox、CirclePointer、SquarePointer 显示 Shape；TilePointer 无匹配 |
| `pointers/types.go`             | 跨包、括号及不支持的指针形态 | 正例归并到 Rect 或 Memory；二级指针、接口指针、新定义指针及泛型实例指针不产生关系                             |
| `store/memory/pointers_test.go` | 指针别名的测试来源过滤       | 过滤开启隐藏 PartialPointer、FakeStorePointer，关闭恢复 Store；ProductionStorePointer 始终保留 Store          |
| `shapes/unsupported.go`         | 不支持的接口及没有方法的类型 | 空接口、约束、泛型接口跳过；没有方法的泛型 Pair 与 Names 没有匹配，不显示名称与图标                           |
| `stream/stream.go`              | 嵌入接口与菱形嵌入           | `ReadWriteCloser` 只显示 `File`；`Reader` 显示 `File`、`Pipe`、`Source`                                       |
| `reset/reset.go`                | 不同声明的同名方法           | `Machine` 显示 `Both`、`Clearer`、`Resetter`                                                                  |
| `store/memory/memory.go`        | 跨包实现、跨包别名           | `Memory` 显示 `Store`；`Local` 解析为 `Store`                                                                 |
| `store/memory/memory.go`        | struct 匿名嵌入              | `Embedded` 保留并带 `?` 标记                                                                                  |
| `store/memory/partial*.go`      | 必要方法仅在测试文件中       | 过滤开启时 `Store` 不显示 `Partial`，关闭后显示                                                               |
| `store/memory/fake_test.go`     | 测试文件声明的类型           | 过滤开启时隐藏 `fakeStore`                                                                                    |
| `store/memory/helper_test.go`   | `_test.go` 未导入 testing    | `helperStore` 保留                                                                                            |
| `store/memory/quick_test.go`    | 仅导入 `testing/quick`       | `quickStore` 保留                                                                                             |
| `defined/types.go`              | 函数、基础类型与集合类型     | `Text` 开启过滤时显示 11 个实现，包括 `Func`、`Count`、`List`、`Pair`、`Dict`、`Queue`                        |
| `defined/types.go`              | 别名、新定义与指针接收者     | `FuncAlias` 归并到 `Func`；`OwnFunc` 独立展示；`DerivedFunc`、`RawFunc` 不匹配；`PointerFunc` 匹配            |
| `defined/sources_test.go`       | 函数类型的测试来源           | 开启过滤隐藏 `TestFunc`、`TestMethodFunc`；关闭过滤后 `Text` 显示 13 个实现                                   |
| `defined/uncertain.go`          | 指针别名接收者与测试方法     | `Runner` 开启过滤返回 `Holder`、`RunFunc`，无问号；关闭后增加 `TestRunFunc`                                   |
| `defined/shadow/shadow.go`      | 遮蔽预声明类型名称           | `Local` 沿本地 `int` 解析为函数类型，实现 `Renderable`，不误判为基础类型                                      |
| `generics/types.go`             | 泛型直接方法与参数改名       | `Box`、`PointerBox` 均实现 `Label`，接收者改名为 U 不影响结果；值与指针形式不重复计数                         |
| `generics/types.go`             | 缺少方法与依赖类型参数       | `Missing` 无匹配；`Dependent` 的必要方法签名依赖 U，关系计入不支持数量，关闭过滤也不显示                      |
| `generics/sources_test.go`      | 泛型类型的测试声明来源       | 过滤开启时 Label 显示 Box、PointerBox；关闭后增加 TestBox，未确认数量为 0                                     |

`*_test.go` 是人工核对测试来源过滤的声明样例，不包含单元测试函数，也无需执行 `go test`。切换 **Go Interfaces: 切换测试来源过滤** 后，在 `store/store.go` 的 `Store` 上重新查看结果；语言服务是否返回测试变体位置取决于当前加载状态，不能仅凭零项结果认定不存在实现。

## 交互检查

指针别名仅支持最终指向非泛型具名 struct 的一级指针。Shape 反向结果仍为 Circle、Rect、Square，别名不增加条目；点击结果跳到原 struct。别名文件不替换规范目标的来源信息：PartialPointer 按必要方法过滤，FakeStorePointer 按类型声明过滤，位于同一测试文件的 ProductionStorePointer 仍按生产类型 Memory 处理。修改别名右侧目标后，应确认旧命令失效、新结果与新目标一致。

泛型支持只覆盖无匿名嵌入的直接 struct，以及签名不依赖接收者类型参数的必要方法。`DependentParameter` 的参数类型依赖 U，因此与 `LabelWith` 的关系也应计入不支持。泛型接口、泛型别名和新定义引用仍不支持；泛型实例按声明归并，不单独计数。必要方法证据通过真实 provider 查询验证，缺失或超预算时不放行该泛型关系。

- 连续输入时，已显示的名称和图标保持不变，输入停止后刷新；刷新期间旧名称不可点击
- 制造临时语法错误时，当前文件保留旧展示；其他文件的语法错误只让相关候选计入无法读取数量
- 修改 `gopls` 构建标记或环境设置后，正在等待的查询立即结束并重新查询
- `goInterfaces.codeLens`、`goInterfaces.gutterIcons` 可以分别关闭
- 嵌套 module、vendor、多工作区文件夹以及远程环境需另行准备，本示例不覆盖
