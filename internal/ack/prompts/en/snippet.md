# Snippet Extraction

Extract contiguous line ranges from a single markdown document that best answer the user question.

---

You are extracting evidence from a markdown document to help answer a user's question.

User question: %s
Document path: %s

Document content (each line is prefixed with its line number):
%s

Pick up to %d contiguous line ranges that best answer the question. Give each a relevance score between 0 and 1.

Return ONLY a JSON object (no markdown fences):
{
  "snippets": [
    {"start": 10, "end": 25, "score": 0.9}
  ]
}

If the document is irrelevant, return {"snippets":[]}.
