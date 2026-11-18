package memory

import "github.com/E1aina2007/Go-interfaces-impl/examples/acceptance/store"

// fakeStore starts empty and discards writes.
// fakeStore 模拟空存储，丢弃写入
type fakeStore struct{}

func (fakeStore) Get(string) (string, bool) { return "", false }

func (fakeStore) Put(string, string) {}

var _ store.Store = fakeStore{}
