# GraphQL API Reference

## Schema

The GraphQL API provides a flexible query interface for the knowledge base.

```graphql
type Query {
  documents(prefix: String): [Document]
  document(path: String!): Document
  search(query: String!, mode: SearchMode): SearchResult
  tags: [Tag]
}

type Document {
  path: String
  title: String
  content: String
  metadata: Metadata
  relations: [Relation]
}

type Tag {
  name: String
  count: Int
  documents: [Document]
}
```

## Usage

Send POST requests to `/api/graphql` with your query in the body.

See also the [REST API](rest.md) for simpler CRUD operations.
