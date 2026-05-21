# Rerank

Select the most relevant documents for the user question.

---

You are selecting documents most relevant to the user's question.

User question: %s

Candidate documents:
%s

Please select up to %d most relevant documents, ordered by relevance descending.
Give each document a relevance score between 0 and 1.

Return ONLY a JSON array (no markdown fences):
[
  {"path": "doc.md", "score": 0.95}
]

If no documents are relevant, return [].
