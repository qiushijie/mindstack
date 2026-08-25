# Query Routing

Map the user question to existing knowledge-base tags AND extract full-text search keywords in a single pass. Return only one JSON object.

---

You are routing a user question to relevant knowledge-base documents.

User question: %s

Available tags in the knowledge base (document count in parentheses):
%s

Return ONLY a JSON object of the form {"tags":[],"keywords":[]} (no markdown fences).

"tags": the tags most relevant to answering the question.
- Must come from the list above, no invention
- High-count tags are more stable, but low-count tags that directly match the question wording should also be kept
- Select 2-5 tags; do not over-select
- If nothing fits, return []

"keywords": 3-8 keywords for full-text search. The knowledge base contains mixed English and Chinese content.
- Prefer compound terms and domain-specific nouns over single generic words, written as space-separated words rather than hyphenated forms (local matching is substring-based). Good: "exponential backoff", "retry policy", "access control". Bad: "system", "filter", "approach", "method"
- If the question references Chinese technical terms, include the Chinese term as-is, and provide equivalent terms in the other language when possible (e.g. "retry policy" -> also "重试策略")
- Remove stop words and generic terms that appear in many documents
- Keep original casing for proper nouns and acronyms

Example: {"tags":["api","rest"],"keywords":["retry policy","exponential backoff","timeout","重试策略"]}
