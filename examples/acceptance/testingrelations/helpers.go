package testingrelations

import "testing"

// Helper is ordinary package code even though it imports testing.
// Helper 即使导入 testing 也属于普通包代码
type Helper struct{ T *testing.T }

func (Helper) TestScopeToken() {}

var _ Token = Helper{}
