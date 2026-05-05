# Tag Extraction

Map user question to existing tags in the knowledge base. Return only a JSON array, no invented tags.

---

You are helping route a user question to relevant knowledge-base documents.

User question: %s

Available tags in the knowledge base:
%s

Pick the tags most relevant to answering the question. Return ONLY a JSON array of tag strings (must come from the list above, no invention). Example: ["api","rest"]
If nothing fits, return [].
