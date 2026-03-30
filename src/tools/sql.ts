import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

// SQL 参数安全类型：仅允许原始类型和数组（用于向量），拒绝任意对象以防类型混淆攻击
const SqlParam = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.number()), // 支持向量参数 [0.1, 0.2, ...]
]);

export function registerSqlTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_sql_query",
    {
      title: "Talon SQL Query",
      description: `Execute a read-only SQL query against the Talon database and return results.

Supports: SELECT, SHOW TABLES, DESCRIBE, EXPLAIN, and other read-only statements.
Vector functions: vec_cosine(), vec_l2(), vec_dot() for similarity search in SQL.
Geo functions: ST_DISTANCE(), ST_WITHIN() for spatial queries.

Args:
  - sql (string): The SQL query to execute
  - params (array, optional): Positional parameters for prepared statements (use ? placeholders)

Returns: { columns: string[], rows: object[], row_count: number }

Examples:
  - "SELECT * FROM users LIMIT 10"
  - "SELECT id, vec_cosine(emb, ?) AS score FROM docs ORDER BY score LIMIT 5" with params [[0.1, 0.2, ...]]
  - "SHOW TABLES"
  - "DESCRIBE users"`,
      inputSchema: {
        sql: z.string().min(1).describe("SQL query to execute (SELECT, SHOW, DESCRIBE, EXPLAIN)"),
        params: z
          .array(SqlParam)
          .optional()
          .describe("Positional parameters for ? placeholders in prepared statements"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.sql(args.sql, args.params);
      if (!res.ok || res.error) return formatError(res.error ?? "Query failed");

      const data = res.data;
      const rows = data?.rows ?? [];
      const columns = data?.columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);

      return formatResult({
        columns,
        rows,
        row_count: rows.length,
      });
    }
  );

  server.registerTool(
    "talon_sql_execute",
    {
      title: "Talon SQL Execute",
      description: `Execute a SQL statement that modifies the database (DDL or DML).

Supports: CREATE TABLE, ALTER TABLE, DROP TABLE, INSERT, UPDATE, DELETE, CREATE INDEX, CREATE VECTOR INDEX, BEGIN, COMMIT, ROLLBACK, TRUNCATE.

Special column types: VECTOR(N) for embeddings, JSONB for JSON, GEOPOINT for coordinates.

Args:
  - sql (string): The SQL statement to execute
  - params (array, optional): Positional parameters for ? placeholders

Returns: { rows_affected: number, message: string }

Examples:
  - "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, emb VECTOR(384))"
  - "INSERT INTO users VALUES (1, 'Alice', '[0.1, 0.2, ...]')"
  - "CREATE VECTOR INDEX idx ON docs(emb) USING HNSW WITH (metric='cosine')"
  - "UPDATE users SET name = ? WHERE id = ?" with params ["Bob", 1]
  - "DELETE FROM users WHERE id = ?" with params [1]`,
      inputSchema: {
        sql: z.string().min(1).describe("SQL statement to execute (DDL/DML)"),
        params: z
          .array(SqlParam)
          .optional()
          .describe("Positional parameters for ? placeholders"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.sql(args.sql, args.params);
      if (!res.ok || res.error) return formatError(res.error ?? "Execution failed");

      return formatResult({
        rows_affected: res.data?.rows_affected ?? res.rows_affected ?? 0,
        message: "Statement executed successfully",
      });
    }
  );
}
