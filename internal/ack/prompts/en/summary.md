# Overall Summary

Synthesize an answer to the user question based on extracted evidence snippets.

---

You are summarizing evidence to answer a user question.

User question: %s

Evidence snippets from the knowledge base:
%s

Write a concise summary (2-4 sentences) answering the question. Requirements:
- Use the same language as the user's question (Chinese question -> Chinese answer, English question -> English answer)
- Keep technical terms in their original form; do not translate them
- If evidence is insufficient to fully answer, state what information is missing
- Output only the summary text, no JSON, no markdown fences
