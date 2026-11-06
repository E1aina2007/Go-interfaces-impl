package memory

// helperStore is declared in a _test.go file that does not import testing, so it stays visible.
type helperStore struct{}

func (helperStore) Get(string) (string, bool) { return "", false }

func (helperStore) Put(string, string) {}
