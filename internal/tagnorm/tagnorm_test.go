package tagnorm

import (
	"reflect"
	"testing"
)

func TestNormalize(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Unit Testing", "unit-testing"},
		{"unit_testing", "unit-testing"},
		{"unit-testing", "unit-testing"},
		{"UNIT--TESTING", "unit-testing"},
		{"  spaced  out  ", "spaced-out"},
		{"a  b__c--d", "a-b-c-d"},
		{"rest.api", "restapi"},
		{"go/lang", "golang"},
		{"GO", "go"},
		{"vue3", "vue3"},
		{"vue-3", "vue-3"},
		{"中文 标签", "中文-标签"},
		{"-leading", "leading"},
		{"trailing-", "trailing"},
		// Protected tech terms keep their identity instead of collapsing
		// into a single letter or losing the leading dot.
		{"c++", "cpp"},
		{"C++", "cpp"},
		{"c#", "csharp"},
		{"C#", "csharp"},
		{"f#", "fsharp"},
		{"F#", "fsharp"},
		{".net", "dotnet"},
		{".NET", "dotnet"},
		{"", ""},
		{"  ", ""},
		{"!!!", ""},
	}
	for _, c := range cases {
		if got := Normalize(c.in); got != c.want {
			t.Errorf("Normalize(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNormalizeAll(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{"nil input", nil, nil},
		{"empty dropped", []string{"", "  ", "go"}, []string{"go"}},
		{"dedupe preserving order", []string{"Go", "go", "GO", "api"}, []string{"go", "api"}},
		{"variants collapse", []string{"Unit Testing", "unit_testing", "unit-testing"}, []string{"unit-testing"}},
		{"distinct kept", []string{"vue3", "vue-3"}, []string{"vue3", "vue-3"}},
	}
	for _, c := range cases {
		got := NormalizeAll(c.in)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: NormalizeAll(%v) = %v, want %v", c.name, c.in, got, c.want)
		}
	}
}

func TestSingularKey(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"tests", "test"},
		{"playwright-tests", "playwright-test"},
		{"policies", "policy"},
		{"cases", "case"},
		{"boxes", "box"},
		{"wishes", "wish"},
		{"classes", "class"},
		{"movies", "movie"},
		// Stoplist: no stripping.
		{"business", "business"},
		{"progress", "progress"},
		{"analysis", "analysis"},
		{"status", "status"},
		// "as" endings are not plurals.
		{"alias", "alias"},
		{"atlas", "atlas"},
		{"bias", "bias"},
		// Non-plural words ending in "s".
		{"news", "news"},
		{"dns", "dns"},
		{"physics", "physics"},
		{"series", "series"},
		{"species", "species"},
		{"kubernetes", "kubernetes"},
		// Too short to strip.
		{"go", "go"},
		{"os", "os"},
		{"css", "css"},
		// Digits and CJK untouched.
		{"vue3", "vue3"},
		{"中文标签", "中文标签"},
		// No trailing plural marker.
		{"unit-testing", "unit-testing"},
		{"cascade-delete", "cascade-delete"},
		{"cascade-deletion", "cascade-deletion"},
	}
	for _, c := range cases {
		if got := SingularKey(c.in); got != c.want {
			t.Errorf("SingularKey(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestGroupKey(t *testing.T) {
	sameGroup := [][]string{
		{"Unit Testing", "unit_testing", "unit-testing"},
		{"playwright-tests", "playwright-test"},
		{"Automation", "automations", "AUTOMATION"},
		{"movies", "movie"},
		{"classes", "class"},
		{"business", "businesses"},
	}
	for _, group := range sameGroup {
		base := GroupKey(group[0])
		for _, other := range group[1:] {
			if got := GroupKey(other); got != base {
				t.Errorf("GroupKey(%q) = %q, want same as GroupKey(%q) = %q", other, got, group[0], base)
			}
		}
	}

	differentGroups := [][2]string{
		{"vue3", "vue-3"},
		{"go", "go-testing"},
		{"cascade-delete", "cascade-deletion"},
		// Protected tech terms must not collapse into each other or into
		// the single-letter "c".
		{"c++", "c#"},
		{"c++", "c"},
		{"c#", "c"},
		{".net", "net"},
	}
	for _, pair := range differentGroups {
		if GroupKey(pair[0]) == GroupKey(pair[1]) {
			t.Errorf("GroupKey(%q) == GroupKey(%q) = %q, want different", pair[0], pair[1], GroupKey(pair[0]))
		}
	}
}
