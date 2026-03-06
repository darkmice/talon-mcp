import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerKvTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_kv_get",
    {
      title: "Talon KV Get",
      description: `Get a value from Talon KV store by key.

The KV engine is Redis-compatible and supports string values with optional TTL.

Args:
  - key (string): The key to look up

Returns: { key: string, value: string | null, exists: boolean }`,
      inputSchema: {
        key: z.string().min(1).describe("Key to retrieve"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("kv", "get", { key: args.key });
      if (!res.ok || res.error) return formatError(res.error ?? "KV get failed");

      return formatResult({
        key: args.key,
        value: res.data ?? null,
        exists: res.data !== null && res.data !== undefined,
      });
    }
  );

  server.registerTool(
    "talon_kv_set",
    {
      title: "Talon KV Set",
      description: `Set a key-value pair in Talon KV store with optional TTL.

Args:
  - key (string): The key to set
  - value (string): The value to store
  - ttl (number, optional): Time-to-live in seconds. Omit for no expiration.

Returns: { key: string, message: string }

Examples:
  - key="user:1", value="Alice" — no expiration
  - key="session:abc", value="token123", ttl=3600 — expires in 1 hour`,
      inputSchema: {
        key: z.string().min(1).describe("Key to set"),
        value: z.string().describe("Value to store"),
        ttl: z.number().int().positive().optional().describe("Time-to-live in seconds (omit for no expiration)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = { key: args.key, value: args.value };
      if (args.ttl !== undefined) params.ttl = args.ttl;

      const res = await client.execute("kv", "set", params);
      if (!res.ok || res.error) return formatError(res.error ?? "KV set failed");

      return formatResult({ key: args.key, message: "OK" });
    }
  );

  server.registerTool(
    "talon_kv_delete",
    {
      title: "Talon KV Delete",
      description: `Delete a key from Talon KV store.

Args:
  - key (string): The key to delete

Returns: { key: string, deleted: boolean }`,
      inputSchema: {
        key: z.string().min(1).describe("Key to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("kv", "del", { key: args.key });
      if (!res.ok || res.error) return formatError(res.error ?? "KV delete failed");

      return formatResult({ key: args.key, deleted: true });
    }
  );

  server.registerTool(
    "talon_kv_scan",
    {
      title: "Talon KV Scan",
      description: `Scan keys in Talon KV store by prefix with pagination.

Args:
  - prefix (string): Key prefix to scan (e.g., "user:", "session:")
  - offset (number, optional): Starting offset (default: 0)
  - limit (number, optional): Maximum keys to return (default: 100, max: 1000)

Returns: { prefix: string, keys: string[], count: number, offset: number }

Examples:
  - prefix="user:" — list all user keys
  - prefix="session:", limit=10 — first 10 session keys`,
      inputSchema: {
        prefix: z.string().describe("Key prefix to scan"),
        offset: z.number().int().min(0).default(0).describe("Starting offset"),
        limit: z.number().int().min(1).max(1000).default(100).describe("Maximum keys to return"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("kv", "keys", {
        prefix: args.prefix,
        offset: args.offset,
        limit: args.limit,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "KV scan failed");

      const keys = Array.isArray(res.data) ? res.data : [];
      return formatResult({
        prefix: args.prefix,
        keys,
        count: keys.length,
        offset: args.offset,
      });
    }
  );

  server.registerTool(
    "talon_kv_mget",
    {
      title: "Talon KV Multi-Get",
      description: `Get multiple values from Talon KV store in a single request.

Args:
  - keys (string[]): Array of keys to retrieve

Returns: { results: Array<{ key: string, value: string | null }> }`,
      inputSchema: {
        keys: z.array(z.string().min(1)).min(1).max(100).describe("Keys to retrieve (max 100)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("kv", "mget", { keys: args.keys });
      if (!res.ok || res.error) return formatError(res.error ?? "KV mget failed");

      return formatResult({ results: res.data });
    }
  );

  server.registerTool(
    "talon_kv_incr",
    {
      title: "Talon KV Increment",
      description: `Atomically increment a numeric value in KV store. Creates the key with value 1 if it doesn't exist.

Args:
  - key (string): The key to increment

Returns: { key: string, value: number }`,
      inputSchema: {
        key: z.string().min(1).describe("Key to increment"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("kv", "incr", { key: args.key });
      if (!res.ok || res.error) return formatError(res.error ?? "KV incr failed");

      return formatResult({ key: args.key, value: res.data });
    }
  );
}
