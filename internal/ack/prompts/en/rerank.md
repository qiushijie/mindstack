# Rerank

Select the most relevant documents for the user question.

---

You are selecting documents most relevant to the user's question. Each document includes metadata and a body preview. Note: some documents may be truncated (total lines shown but only first 50 displayed); key content may be outside the preview range.

User question: %s

Candidate documents:
%s

Please select up to %d most relevant documents, ordered by relevance descending.
Give each document a relevance score between 0 and 1.

Scoring guide:
- 0.8-1.0: Document directly answers the question
- 0.5-0.7: Document contains relevant information but needs further extraction
- 0.3-0.4: Document topic is related but may not directly answer the question
- 0.0-0.2: Barely relevant

Return ONLY a JSON array (no markdown fences):
[
  {"path": "doc.md", "score": 0.95}
]

If no documents are relevant, return [].
