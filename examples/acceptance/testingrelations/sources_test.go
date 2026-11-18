package testingrelations

// This file is test-only without importing testing or declaring test functions.
// 本文件不导入 testing 也不声明测试函数，仍属于测试专用来源
type LocalToken interface{ TestScopeToken() }
type LocalItem struct{}

func (LocalItem) TestScopeToken() {}
func (Item) TestScopeReset()      {}

type ItemAlias = Item

var (
	_ Token      = LocalItem{}
	_ LocalToken = Item{}
	_ Resettable = Item{}
)
