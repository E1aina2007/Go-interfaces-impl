// Package testingrelations demonstrates source filtering in ordinary and test files.
// testingrelations 包展示普通文件和测试文件中的来源过滤
package testingrelations

type Token interface{ TestScopeToken() }
type Resettable interface{ TestScopeReset() }

type Item struct{}

func (Item) TestScopeToken() {}

// Embedded keeps the existing conservative classification of promoted methods.
// Embedded 保留提升方法的现有保守来源分类
type Embedded struct{ Item }

var _ Token = Item{}
