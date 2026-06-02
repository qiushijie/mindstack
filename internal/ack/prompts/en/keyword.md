# Keyword Extraction

Split user question into independent keywords in the original language for full-text search.

---

You are splitting a user question into individual keywords for full-text search in a knowledge base.

User question: %s

Please split the question into 3-8 independent keywords:
- Keep the original language
- Remove stop words (e.g. "what", "how", "is", "the", "a", "to", "do")
- Keep only substantive terms

Return ONLY a JSON string array (no markdown fences). Example: ["retry","policy","exponential","backoff","timeout"]
