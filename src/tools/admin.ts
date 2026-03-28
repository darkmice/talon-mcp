import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerAdminTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_list_tables",
    {
      title: "Talon List Tables",
      description: `List all tables in the Talon database. Equivalent to SHOW TABLES.

Returns: { tables: Array<{ name: string, type: string }> }`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const res = await client.sql("SHOW TABLES");
      if (!res.ok || res.error) return formatError(res.error ?? "List tables failed");

      return formatResult({ tables: res.data?.rows ?? [] });
    }
  );

  server.registerTool(
    "talon_describe_table",
    {
      title: "Talon Describe Table",
      description: `Get the schema/column definitions for a specific table. Equivalent to DESCRIBE <table>.

Args:
  - table (string): Table name to describe

Returns: { table: string, columns: Array<{ name: string, type: string, nullable: boolean, primary_key: boolean }> }`,
      inputSchema: {
        table: z.string().min(1).describe("Table name"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      // 表名白名单校验：仅允许字母、数字、下划线和点号（schema.table 格式）
      const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
      if (!TABLE_NAME_RE.test(args.table)) {
        return formatError(
          `Invalid table name: "${args.table}". Table names must contain only letters, numbers, underscores, and dots.`
        );
      }

      const res = await client.sql(`DESCRIBE ${args.table}`);
      if (!res.ok || res.error) return formatError(res.error ?? "Describe table failed");

      return formatResult({ table: args.table, columns: res.data?.rows ?? [] });
    }
  );

  server.registerTool(
    "talon_server_info",
    {
      title: "Talon Server Info",
      description: `Get Talon server status, version, and database statistics.

Returns: { status: string, version: string, stats: object }`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const healthRes = await client.health();

      const statsRes = await client.execute("admin", "stats", {});

      const info: Record<string, unknown> = {
        server_url: client.baseUrl,
        connected: healthRes.ok,
      };

      if (healthRes.ok && healthRes.data) {
        info.status = healthRes.data.status;
        info.version = healthRes.data.version;
      } else {
        info.status = "unreachable";
        info.error = healthRes.error;
      }

      if (statsRes.ok) {
        info.stats = statsRes.data;
      }

      return formatResult(info);
    }
  );

  server.registerTool(
    "talon_persist",
    {
      title: "Talon Persist",
      description: `Force flush all in-memory data to disk. Use after batch writes to ensure durability.

Returns: { message: string }`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const res = await client.execute("admin", "persist", {});
      if (!res.ok || res.error) return formatError(res.error ?? "Persist failed");

      return formatResult({ message: "Data persisted to disk" });
    }
  );

  server.registerTool(
    "talon_raw_execute",
    {
      title: "Talon Raw Execute",
      description: `Execute a raw command against the Talon engine. Use this for advanced operations not covered by other tools.

The Talon command format: { module, action, params }.

Available modules: sql, kv, vector, ts, mq, fts, geo, graph, ai, admin.
Each module has specific actions — refer to Talon documentation for full API.

Args:
  - module (string): Engine module name
  - action (string): Action to perform
  - params (object): Action parameters

Returns: Raw response from Talon server

Examples:
  - module="kv", action="setnx", params={"key":"lock:job","value":"worker1","ttl":30}
  - module="graph", action="pagerank", params={"graph":"social","iterations":20,"damping":0.85}
  - module="fts", action="suggest", params={"index":"articles","prefix":"tai","limit":5}`,
      inputSchema: {
        module: z.string().min(1).describe("Engine module (sql, kv, vector, ts, mq, fts, geo, graph, ai, admin)"),
        action: z.string().min(1).describe("Action to perform"),
        params: z.record(z.unknown()).default({}).describe("Action parameters"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute(
        args.module,
        args.action,
        args.params as Record<string, unknown>
      );
      if (!res.ok || res.error) return formatError(res.error ?? "Execute failed");

      return formatResult(res.data);
    }
  );
}
