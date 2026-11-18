package testingrelations_test

import "github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/testingrelations"

type ExternalToken interface{ TestScopeToken() }
type ExternalItem struct{}

func (ExternalItem) TestScopeToken() {}

// An external test package can refer to exported types without adding methods to them.
// 外部测试包可以引用导出类型，但不能为它们新增方法
type ItemAlias = testingrelations.Item

var (
	_ ExternalToken          = testingrelations.Item{}
	_ testingrelations.Token = ExternalItem{}
)
