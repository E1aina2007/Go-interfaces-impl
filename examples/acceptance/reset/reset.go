// Package reset covers same-name methods that come from different declarations.
// reset 包展示来自不同接口声明的同名方法
package reset

import (
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/reset/a"
	"github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/reset/b"
)

// Both embeds cross-package interfaces whose Reset methods are declared separately.
// Both 嵌入跨包接口，两个 Reset 方法来自不同声明
type Both interface {
	a.Resetter
	b.Clearer
}

// Machine is expected to show Both, Clearer and Resetter.
// Machine 应显示 Both、Clearer 和 Resetter
type Machine struct {
	state int
}

func (m *Machine) Reset() { m.state = 0 }

var _ Both = (*Machine)(nil)
