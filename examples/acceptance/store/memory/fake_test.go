package memory

import "testing"

// fakeStore is declared in a _test.go file that imports testing and is hidden by default.
type fakeStore struct{}

func (fakeStore) Get(string) (string, bool) { return "", false }

func (fakeStore) Put(string, string) {}

func TestFake(t *testing.T) {
	t.Log(fakeStore{})
}
