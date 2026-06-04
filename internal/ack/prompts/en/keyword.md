# Keyword Extraction

Extract substantive compound terms and domain-specific nouns from the user question for full-text search, including equivalent Chinese terms where applicable.

---

You are extracting keywords from a user question for full-text search in a knowledge base. The knowledge base contains mixed English and Chinese content.

User question: %s

Please extract 3-8 keywords:
- Prefer compound terms and domain-specific nouns over single generic words. Good: "exponential-backoff", "retry-policy", "access-control". Bad: "system", "filter", "approach", "method".
- If the question references Chinese technical terms, include the Chinese term as-is.
- Provide equivalent terms in the other language when possible (e.g. if the question mentions "retry policy", also include "重试策略").
- Remove stop words and generic terms that appear in many documents.
- Keep original casing for proper nouns and acronyms.

Return ONLY a JSON string array (no markdown fences). Example: ["retry-policy","exponential-backoff","timeout","重试策略","退避"]
