/**
 * Admin 工具模块测试
 *
 * Mock TalonClient，验证 registerAdminTools 注册的管理工具行为。
 * 同时验证 SQL 注入修复后的表名校验。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { registerAdminTools } from "./admin.js";

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

describe("Admin Tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: { sql: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn>; health: ReturnType<typeof vi.fn>; baseUrl: string };

  beforeEach(async () => {
    mockServer = createMockServer();
    const { __mockClient } = await import("../client.js") as unknown as { __mockClient: typeof mockClient };
    mockClient = __mockClient;
    vi.clearAllMocks();
    registerAdminTools(mockServer as unknown as Parameters<typeof registerAdminTools>[0]);
  });

  it("should register 5 admin tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(5);
    expect(mockServer.getHandler("talon_list_tables")).toBeDefined();
    expect(mockServer.getHandler("talon_describe_table")).toBeDefined();
    expect(mockServer.getHandler("talon_server_info")).toBeDefined();
    expect(mockServer.getHandler("talon_persist")).toBeDefined();
    expect(mockServer.getHandler("talon_raw_execute")).toBeDefined();
  });

  describe("talon_list_tables", () => {
    it("should return table list", async () => {
      mockClient.sql.mockResolvedValue({
        ok: true,
        data: { rows: [{ name: "users", type: "table" }] },
      });

      const handler = mockServer.getHandler("talon_list_tables")!;
      const result = await handler({});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tables).toHaveLength(1);
    });
  });

  describe("talon_describe_table", () => {
    it("should describe a valid table name", async () => {
      mockClient.sql.mockResolvedValue({
        ok: true,
        data: { rows: [{ name: "id", type: "INTEGER" }] },
      });

      const handler = mockServer.getHandler("talon_describe_table")!;
      const result = await handler({ table: "users" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.table).toBe("users");
      expect(parsed.columns).toHaveLength(1);
    });

    it("should reject table names with SQL injection", async () => {
      const handler = mockServer.getHandler("talon_describe_table")!;
      const result = await handler({ table: "users; DROP TABLE users" });
      expect(result.content[0].text).toContain("Error:");
      expect(result.content[0].text).toContain("Invalid table name");
      // confirm sql was NOT called
      expect(mockClient.sql).not.toHaveBeenCalled();
    });

    it("should allow underscored table names", async () => {
      mockClient.sql.mockResolvedValue({
        ok: true,
        data: { rows: [] },
      });

      const handler = mockServer.getHandler("talon_describe_table")!;
      await handler({ table: "user_sessions_v2" });
      expect(mockClient.sql).toHaveBeenCalled();
    });
  });

  describe("talon_server_info", () => {
    it("should combine health and stats", async () => {
      mockClient.health.mockResolvedValue({
        ok: true,
        data: { status: "ok", version: "1.0.0" },
      });
      mockClient.execute.mockResolvedValue({
        ok: true,
        data: { tables: 5, kv_keys: 100 },
      });

      const handler = mockServer.getHandler("talon_server_info")!;
      const result = await handler({});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(true);
      expect(parsed.status).toBe("ok");
      expect(parsed.stats).toBeDefined();
    });

    it("should handle unreachable server", async () => {
      mockClient.health.mockResolvedValue({
        ok: false,
        error: "Cannot reach server",
      });
      mockClient.execute.mockResolvedValue({ ok: false });

      const handler = mockServer.getHandler("talon_server_info")!;
      const result = await handler({});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(false);
      expect(parsed.status).toBe("unreachable");
    });
  });

  describe("talon_raw_execute", () => {
    it("should forward module/action/params to client", async () => {
      mockClient.execute.mockResolvedValue({ ok: true, data: { result: "ok" } });

      const handler = mockServer.getHandler("talon_raw_execute")!;
      await handler({ module: "graph", action: "pagerank", params: { graph: "social" } });

      expect(mockClient.execute).toHaveBeenCalledWith("graph", "pagerank", { graph: "social" });
    });
  });
});
