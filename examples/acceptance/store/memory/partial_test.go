package memory

import (
	"testing"

	"goifaces.example/acceptance/store"
)

// Put completes Store for Partial only in the test package variant.
func (p Partial) Put(key, value string) {}

func TestPartial(t *testing.T) {
	var s store.Store = Partial{value: "v"}
	if _, ok := s.Get("k"); !ok {
		t.Fatal("expected a value")
	}
}
