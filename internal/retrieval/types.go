package retrieval

// Mode determines how the query is matched against documents.
type Mode string

const (
	ModeTag      Mode = "tag"
	ModeFulltext Mode = "fulltext"
	ModeHybrid   Mode = "hybrid"
)

// TagMode controls how multiple tags are combined.
type TagMode string

const (
	TagModeAND TagMode = "and"
	TagModeOR  TagMode = "or"
)

// Options configures a single retrieval call.
type Options struct {
	Mode    Mode
	Limit   int
	Subdir  string
	TagMode TagMode
}

// Query is the normalized form of a user query.
type Query struct {
	Raw   string
	Terms []string
	Tags  []string
}

// MatchBreakdown gives a human-readable explanation of the score.
type MatchBreakdown struct {
	TagHits     int `json:"tagHits"`
	TitleHits   int `json:"titleHits"`
	SummaryHits int `json:"summaryHits"`
	HeadingHits int `json:"headingHits"`
	KeywordHits int `json:"keywordHits,omitempty"`
	AliasHits   int `json:"aliasHits,omitempty"`
	ContentHits int `json:"contentHits"`
}

// LineMatch records a single line that contributed to the score.
type LineMatch struct {
	Line   int    `json:"line"`
	Text   string `json:"text"`
	Term   string `json:"term,omitempty"`
	Source string `json:"source"`
}

// Result is a single retrieved document.
type Result struct {
	Path      string         `json:"path"`
	RelPath   string         `json:"-"`
	Title     string         `json:"title"`
	Summary   string         `json:"summary"`
	Tags      []string       `json:"tags,omitempty"`
	Score     int            `json:"score"`
	Breakdown MatchBreakdown `json:"breakdown"`
	Matches   []LineMatch    `json:"matches,omitempty"`
}

// ResultSet is the top-level response of a retrieval call.
type ResultSet struct {
	Query   string   `json:"query"`
	Mode    Mode     `json:"mode"`
	Results []Result `json:"results"`
	Total   int      `json:"total"`
}

// Source names for LineMatch.Source.
const (
	SourceContent = "content"
	SourceHeading = "heading"
	SourceTitle   = "title"
	SourceSummary = "summary"
	SourceKeyword = "keyword"
	SourceAlias   = "alias"
	SourceTag     = "tag"
)
