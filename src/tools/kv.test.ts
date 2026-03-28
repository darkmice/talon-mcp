/**
 * KV 工具模块测试
 *
 * Mock TalonClient，验证 registerKvTools 注册的 6 个 KV 工具行为。
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

import { registerKvTools } from "./kv.js";

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

describe("KV Tools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockServer = createMockServer();
    const { __mockClient } = await import("../client.js") as unknown as { __mockClient: typeof mockClient };
    mockClient = __mockClient;
    vi.clearAllMocks();
    registerKvTools(mockServer as unknown as Parameters<typeof registerKvTools>[0]);
  });

  it("should register 6 KV tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(6);
    expect(mockServer.getHandler("talon_kv_get")).toBeDefined();
    expect(mockServer.getHandler("talon_kv_set")).toBeDefined();
    expect(mockServer.getHandler("talon_kv_delete")).toBeDefined();
    expect(mockServer.getHandler("talon_kv_scan")).toBeDefined();
    expect(mockServer.getHandler("talon_kv_mget")).toBeDefined();
    expect(mockServer.getHandler("talon_kv_incr")).toBeDefined();
  });

  describe("talon_kv_get", () => {
    it("should return value when key exists", async () => {
      mockClient.execute.mockResolvedValue({ ok: true, data: "hello" });

      const handler = mockServer.getHandler("talon_kv_get")!;
      const result = await handler({ key: "user:1" });

      expect(mockClient.execute).toHaveBeenCalledWith("kv", "get", { key: "user:1" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.value).toBe("hello");
      expect(parsed.exists).toBe(true);
    });

    it("should return null when key does not exist", async () => {
      mockClient.execute.mockResolvedValue({ ok: true, data: null });

      const handler = mockServer.getHandler("talon_kv_get")!;
      const result = await handler({ key: "nonexistent" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.value).toBeNull();
      expect(parsed.exists).toBe(false);
    });

    it("should handle error", async () => {
      mockClient.execute.mockResolvedValue({ ok: false, error: "connection lost" });

      const handler = mockServer.getHandler("talon_kv_get")!;
      const result = await handler({ key: "test" });
      expect(result.content[0].text).toContain("Error:");
    });
  });

  describe("talon_kv_set", () => {
    it("should set value without TTL", async () => {
      mockClient.execute.mockResolvedValue({ ok: true });

      const handler = mockServer.getHandler("talon_kv_set")!;
      const result = await handler({ key: "user:1", value: "Alice" });

      expect(mockClient.execute).toHaveBeenCalledWith("kv", "set", {
        key: "user:1",
        value: "Alice",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toBe("OK");
    });

    it("should set value with TTL", async () => {
      mockClient.execute.mockResolvedValue({ ok: true });

      const handler = mockServer.getHandler("talon_kv_set")!;
      await handler({ key: "session:abc", value: "token", ttl: 3600 });

      expect(mockClient.execute).toHaveBeenCalledWith("kv", "set", {
        key: "session:abc",
        value: "token",
        ttl: 3600,
      });
    });
  });

  describe("talon_kv_delete", () => {
    it("should delete key", async () => {
      mockClient.execute.mockResolvedValue({ ok: true });

      const handler = mockServer.getHandler("talon_kv_delete")!;
      const result = await handler({ key: "old_key" });

      expect(mockClient.execute).toHaveBeenCalledWith("kv", "del", { key: "old_key" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe(true);
    });
  });

  describe("talon_kv_scan", () => {
    it("should scan with prefix and pagination", async () => {
      mockClient.execute.mockResolvedValue({
        ok: true,
        data: ["user:1", "user:2", "user:3"],
      });

      const handler = mockServer.getHandler("talon_kv_scan")!;
      const result = await handler({ prefix: "user:", offset: 0, limit: 100 });

      expect(mockClient.execute).toHaveBeenCalledWith("kv", "keys", {
        prefix: "user:",
        offset: 0,
        limit: 100,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(3);
      expect(parsed.keys).toContain("user:1");
    });
  });

  describe("talon_kv_incr", () => {
    it("should increment and return new value", async () => {
      mockClient.execute.mockResolvedValue({ ok: true, data: 42 });

      const handler = mockServer.getHandler("talon_kv_incr")!;
      const result = await handler({ key: "counter" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.value).toBe(42);
    });
  });
});
