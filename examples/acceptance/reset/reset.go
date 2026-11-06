// Package reset covers same-name methods that come from different declarations.
package reset

import (
	"goifaces.example/acceptance/reset/a"
	"goifaces.example/acceptance/reset/b"
)

// Both embeds cross-package interfaces whose Reset methods are declared separately.
type Both interface {
	a.Resetter
	b.Clearer
}

// Machine is expected to show Both, Clearer and Resetter.
type Machine struct {
	state int
}

func (m *Machine) Reset() { m.state = 0 }
