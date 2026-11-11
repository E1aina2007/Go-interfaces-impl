package defined

import "testing"

var _ *testing.T

// TestFunc is a manual filtering fixture, with no unit test function.
// TestFunc 用于人工核对过滤行为，不包含单元测试函数
type TestFunc func() string

func (f TestFunc) String() string       { return f() }
func (f TestMethodFunc) String() string { return f() }

func (f TestRunFunc) Run() { f() }
