# Tag Extraction

Map user question to existing tags in the knowledge base. Return only a JSON array, no invented tags.

---

You are helping route a user question to relevant knowledge-base documents.

User question: %s

Available tags in the knowledge base (document count in parentheses; prefer tags with higher counts):
%s

Pick the tags most relevant to answering the question. Rules:
- Return ONLY a JSON array of tag strings (must come from the list above, no invention)
- Prefer tags with higher document counts as they tend to be more reliable
- Select 2-5 tags; do not over-select
- If nothing fits, return []

Example: ["api","rest"]
