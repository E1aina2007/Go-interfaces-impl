package memory

// Partial declares Get here, while Put exists only in partial_test.go, which imports testing.
// With filtering enabled, Partial is expected to be hidden from Store results.
type Partial struct {
	value string
}

func (p Partial) Get(key string) (string, bool) { return p.value, p.value != "" }
