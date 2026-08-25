package ack

import "testing"

func TestAutoDetectLang(t *testing.T) {
	cases := []struct {
		query string
		want  string
	}{
		{"what is the retry policy", "en"},
		{"什么是重试策略", "zh"},
		{"retry 重试 policy", "zh"},
		{"REST API", "en"},
		{"", "en"},
	}
	for _, c := range cases {
		if got := AutoDetectLang(c.query); got != c.want {
			t.Errorf("AutoDetectLang(%q) = %q, want %q", c.query, got, c.want)
		}
	}
}
