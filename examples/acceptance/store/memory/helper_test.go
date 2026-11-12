package memory

// helperStore is declared in a _test.go file that does not import testing, so it stays visible.
// helperStore 所在的 _test.go 文件没有导入 testing，预期保留
type helperStore struct{}

func (helperStore) Get(string) (string, bool) { return "", false }

func (helperStore) Put(string, string) {}
