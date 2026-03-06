import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerFtsTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_fts_search",
    {
      title: "Talon Full-Text Search",
      description: `Perform full-text search with BM25 scoring in Talon.

Supports: keyword search, phrase search, fuzzy search, boolean queries.
Built-in analyzers: Standard (Unicode), Jieba (Chinese), Whitespace, Keyword.

Args:
  - index (string): FTS index name
  - query (string): Search query text
  - limit (number, optional): Maximum results (default: 10)

Returns: { index: string, hits: Array<{ doc_id: string, score: number, highlights?: object }>, count: number }

Examples:
  - index="articles", query="AI database", limit=5
  - index="articles", query="machine learning", limit=20`,
      inputSchema: {
        index: z.string().min(1).describe("FTS index name"),
        query: z.string().min(1).describe("Search query text"),
        limit: z.number().int().min(1).max(1000).default(10).describe("Maximum results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("fts", "search", {
        index: args.index,
        query: args.query,
        limit: args.limit,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "FTS search failed");

      const hits = Array.isArray(res.data) ? res.data : [];
      return formatResult({ index: args.index, hits, count: hits.length });
    }
  );

  server.registerTool(
    "talon_fts_index_doc",
    {
      title: "Talon FTS Index Document",
      description: `Index a document into a Talon full-text search index.

Args:
  - index (string): FTS index name
  - doc_id (string): Unique document ID
  - fields (object): Document fields as key-value pairs (e.g., {"title": "...", "body": "..."})

Returns: { index: string, doc_id: string, message: string }`,
      inputSchema: {
        index: z.string().min(1).describe("FTS index name"),
        doc_id: z.string().min(1).describe("Unique document ID"),
        fields: z.record(z.string()).describe("Document fields as key-value pairs"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("fts", "index", {
        index: args.index,
        doc_id: args.doc_id,
        fields: args.fields,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "FTS index failed");

      return formatResult({ index: args.index, doc_id: args.doc_id, message: "Document indexed" });
    }
  );

  server.registerTool(
    "talon_fts_hybrid_search",
    {
      title: "Talon Hybrid Search (BM25 + Vector)",
      description: `Perform hybrid search combining BM25 full-text scoring and vector similarity using Reciprocal Rank Fusion (RRF).

This is the recommended approach for RAG pipelines.

Args:
  - fts_index (string): FTS index name
  - vec_index (string): Vector index name
  - query_text (string): Text query for BM25
  - query_vector (number[]): Embedding vector for similarity
  - limit (number, optional): Maximum results (default: 10)
  - fts_weight (number, optional): BM25 weight 0-1 (default: 0.5)
  - vec_weight (number, optional): Vector weight 0-1 (default: 0.5)

Returns: { hits: Array<{ id: string, score: number }>, count: number }`,
      inputSchema: {
        fts_index: z.string().min(1).describe("FTS index name"),
        vec_index: z.string().min(1).describe("Vector index name"),
        query_text: z.string().min(1).describe("Text query for BM25 scoring"),
        query_vector: z.array(z.number()).min(1).describe("Embedding vector for similarity"),
        limit: z.number().int().min(1).max(1000).default(10).describe("Maximum results"),
        fts_weight: z.number().min(0).max(1).default(0.5).describe("BM25 weight (0-1)"),
        vec_weight: z.number().min(0).max(1).default(0.5).describe("Vector weight (0-1)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("fts", "hybrid_search", {
        fts_index: args.fts_index,
        vec_index: args.vec_index,
        query_text: args.query_text,
        query_vector: args.query_vector,
        limit: args.limit,
        fts_weight: args.fts_weight,
        vec_weight: args.vec_weight,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Hybrid search failed");

      const hits = Array.isArray(res.data) ? res.data : [];
      return formatResult({ hits, count: hits.length });
    }
  );

  server.registerTool(
    "talon_fts_create_index",
    {
      title: "Talon Create FTS Index",
      description: `Create a new full-text search index in Talon.

Available analyzers: "standard" (Unicode), "jieba" (Chinese), "whitespace", "keyword" (exact match).

Args:
  - name (string): Index name
  - analyzer (string, optional): Analyzer type (default: "standard")

Returns: { name: string, message: string }`,
      inputSchema: {
        name: z.string().min(1).describe("Index name"),
        analyzer: z
          .enum(["standard", "jieba", "whitespace", "keyword"])
          .default("standard")
          .describe("Text analyzer"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("fts", "create_index", {
        name: args.name,
        analyzer: args.analyzer,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Create FTS index failed");

      return formatResult({ name: args.name, message: "FTS index created" });
    }
  );
}
