# Snippet Extraction

Extract the most relevant snippets from a document for the user's question.

---

You are extracting relevant snippets from a document for a user's question.

User question: %s

Document content (line:content):
%s

Extract up to %d most relevant contiguous snippets. Requirements:
- Snippets must be contiguous lines from the document
- Each snippet should be no longer than 15 lines
- Prefer content that directly answers the question, followed by background or related details
- Give each snippet a relevance score between 0 and 1

Return ONLY a JSON array (no markdown fences):
[
  {"startLine": 10, "endLine": 20, "score": 0.95}
]

If nothing is relevant, return [].
