import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerVectorTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_vector_search",
    {
      title: "Talon Vector Search",
      description: `Perform vector similarity search using HNSW index in Talon.

Supported metrics: cosine, l2, dot.

Args:
  - index (string): Name of the vector index
  - query_vector (number[]): Query embedding vector
  - k (number, optional): Number of nearest neighbors to return (default: 10)
  - metric (string, optional): Distance metric — "cosine" (default), "l2", or "dot"

Returns: { index: string, results: Array<{ id: number, score: number }>, count: number }

Examples:
  - index="embeddings", query_vector=[0.1, 0.2, ...], k=5, metric="cosine"`,
      inputSchema: {
        index: z.string().min(1).describe("Vector index name"),
        query_vector: z.array(z.number()).min(1).describe("Query embedding vector"),
        k: z.number().int().min(1).max(1000).default(10).describe("Number of nearest neighbors"),
        metric: z
          .enum(["cosine", "l2", "dot"])
          .default("cosine")
          .describe("Distance metric: cosine, l2, or dot"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("vector", "search", {
        index: args.index,
        vector: args.query_vector,
        k: args.k,
        metric: args.metric,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Vector search failed");

      const results = Array.isArray(res.data) ? res.data : [];
      return formatResult({ index: args.index, results, count: results.length });
    }
  );

  server.registerTool(
    "talon_vector_insert",
    {
      title: "Talon Vector Insert",
      description: `Insert a vector into a Talon HNSW index.

Args:
  - index (string): Vector index name
  - id (number): Unique ID for this vector
  - vector (number[]): The embedding vector to insert

Returns: { index: string, id: number, message: string }`,
      inputSchema: {
        index: z.string().min(1).describe("Vector index name"),
        id: z.number().int().describe("Unique ID for the vector"),
        vector: z.array(z.number()).min(1).describe("Embedding vector to insert"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("vector", "insert", {
        index: args.index,
        id: args.id,
        vector: args.vector,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Vector insert failed");

      return formatResult({ index: args.index, id: args.id, message: "Inserted" });
    }
  );

  server.registerTool(
    "talon_vector_create_index",
    {
      title: "Talon Create Vector Index",
      description: `Create a new HNSW vector index in Talon.

Args:
  - name (string): Index name
  - dimension (number): Vector dimensionality (e.g., 384 for MiniLM, 1536 for text-embedding-ada-002)
  - metric (string, optional): Distance metric — "cosine" (default), "l2", or "dot"

Returns: { name: string, dimension: number, metric: string, message: string }`,
      inputSchema: {
        name: z.string().min(1).describe("Index name"),
        dimension: z.number().int().min(1).max(65536).describe("Vector dimensionality"),
        metric: z
          .enum(["cosine", "l2", "dot"])
          .default("cosine")
          .describe("Distance metric"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("vector", "create", {
        name: args.name,
        dimension: args.dimension,
        metric: args.metric,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Create vector index failed");

      return formatResult({
        name: args.name,
        dimension: args.dimension,
        metric: args.metric,
        message: "Vector index created",
      });
    }
  );
}
