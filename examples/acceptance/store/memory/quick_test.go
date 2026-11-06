package memory

import "testing/quick"

// quickStore imports testing/quick rather than testing, so it stays visible.
type quickStore struct{}

func (quickStore) Get(string) (string, bool) { return "", false }

func (quickStore) Put(string, string) {}

var _ = quick.Check
