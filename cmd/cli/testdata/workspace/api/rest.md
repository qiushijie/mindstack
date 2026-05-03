# REST API Reference

## Authentication

All API endpoints require a valid token in the `Authorization` header.

## Endpoints

### List Documents

`GET /api/v1/documents`

Returns a paginated list of documents in the knowledge base.

### Read Document

`GET /api/v1/documents/:path`

Returns the full content and metadata of a specific document.

### Create Document

`POST /api/v1/documents`

Creates a new document with the provided content.

### Update Document

`PUT /api/v1/documents/:path`

Updates an existing document. Supports partial updates via the `edit` endpoint.

### Search

`GET /api/v1/search?q=query&tag=optional`

Search documents by full-text query or tag filter.

## Error Codes

| Code | Meaning |
|------|---------|
| NOT_FOUND | Document does not exist |
| INVALID_PATH | Path traversal detected |
| NOT_INITIALIZED | Knowledge base not initialized |
