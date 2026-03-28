/**
 * SQL 工具模块测试
 *
 * Mock TalonClient，验证 registerSqlTools 注册的工具行为。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock client module
vi.mock("../client.js", () => {
  const mockClient = {
    sql: vi.fn(),
    execute: vi.fn(),
    health: vi.fn(),
    baseUrl: "http://test:8080",
  };
  return {
    getTalonClient: () => mockClient,
    formatError: (e: string) => ({ content: [{ type: "text" as const, text: `Error: ${e}` }] }),
    formatResult: (d: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(d) }] }),
    __mockClient: mockClient,
  };
});

import { registerSqlTools } from "./sql.js";

// 捕获 registerTool 注册的 handler
type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

function createMockServer() {
  const tools = new Map<string, ToolHandler>();
  return {
    registerTool: vi.fn((name: string, _opts: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    }),
    getHandler: (name: string) => tools.get(name),
  };
}

describe("SQL Tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: { sql: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockServer = createMockServer();
    const { __mockClient } = await import("../client.js") as unknown as { __mockClient: typeof mockClient };
    mockClient = __mockClient;
    vi.clearAllMocks();
    registerSqlTools(mockServer as unknown as Parameters<typeof registerSqlTools>[0]);
  });

  it("should register two SQL tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    expect(mockServer.getHandler("talon_sql_query")).toBeDefined();
    expect(mockServer.getHandler("talon_sql_execute")).toBeDefined();
  });

  describe("talon_sql_query", () => {
    it("should return formatted query results", async () => {
      mockClient.sql.mockResolvedValue({
        ok: true,
        data: {
          columns: ["id", "name"],
          rows: [{ id: 1, name: "Alice" }],
        },
      });

      const handler = mockServer.getHandler("talon_sql_query")!;
      const result = await handler({ sql: "SELECT * FROM users" });

      expect(mockClient.sql).toHaveBeenCalledWith("SELECT * FROM users", undefined);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.row_count).toBe(1);
      expect(parsed.columns).toContain("id");
    });

    it("should handle empty results", async () => {
      mockClient.sql.mockResolvedValue({
        ok: true,
        data: { columns: [], rows: [] },
      });

      const handler = mockServer.getHandler("talon_sql_query")!;
      const result = await handler({ sql: "SELECT * FROM empty" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.row_count).toBe(0);
    });

    it("should handle error response", async () => {
      mockClient.sql.mockResolvedValue({
        ok: false,
        error: "syntax error",
      });

      const handler = mockServer.getHandler("talon_sql_query")!;
      const result = await handler({ sql: "BAD SQL" });
      expect(result.content[0].text).toContain("Error:");
    });
  });

  describe("talon_sql_execute", () => {
    it("should return rows_affected on success", async () => {
      mockClient.sql.mockResolvedValue({
        ok: true,
        data: { rows_affected: 3 },
      });

      const handler = mockServer.getHandler("talon_sql_execute")!;
      const result = await handler({ sql: "DELETE FROM users WHERE age > 100" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.rows_affected).toBe(3);
      expect(parsed.message).toContain("successfully");
    });
  });
});
