package ack

import "unicode"

// AutoDetectLang returns "zh" when the query contains CJK ideographs,
// otherwise "en".
func AutoDetectLang(query string) string {
	for _, r := range query {
		if unicode.Is(unicode.Han, r) {
			return "zh"
		}
	}
	return "en"
}
