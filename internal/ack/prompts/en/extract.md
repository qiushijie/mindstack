# Snippet Extraction

Extract the most relevant snippets from a document for the user's question.

---

You are extracting relevant snippets from a document for a user's question. Note: the document content may have been pre-filtered to include only potentially relevant regions; line numbers may not be continuous.

User question: %s

Document content (line:content):
%s

Extract up to %d most relevant contiguous snippets. Requirements:
- Snippets must be contiguous lines (consecutive line numbers)
- Each snippet should be no longer than 15 lines
- Prefer content that directly answers the question, followed by background or related details
- If line numbers are not continuous, you may split at discontinuities
- Give each snippet a relevance score between 0 and 1

Return ONLY a JSON array (no markdown fences):
[
  {"location": "#10-20", "score": 0.95}
]

If nothing is relevant, return [].
