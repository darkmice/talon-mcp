/**
 * TalonClient 单元测试
 *
 * 使用 vitest 的 vi.fn() mock fetch，验证 HTTP 请求构建、超时处理、错误格式化。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TalonClient, formatError, formatResult } from "./client.js";

// 保存原始 fetch
const originalFetch = globalThis.fetch;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>
) {
  globalThis.fetch = vi.fn(handler) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TalonClient", () => {
  describe("sql()", () => {
    it("should send correct POST request to /api/sql", async () => {
      mockFetch(async (url, init) => {
        expect(url).toBe("http://localhost:8080/api/sql");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(init?.body as string);
        expect(body.sql).toBe("SELECT 1");
        expect(body.params).toEqual([]);

        return new Response(
          JSON.stringify({
            ok: true,
            data: { columns: ["1"], rows: [{ "1": 1 }] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const client = new TalonClient({ baseUrl: "http://localhost:8080" });
      const res = await client.sql("SELECT 1");
      expect(res.ok).toBe(true);
      expect(res.data?.rows).toHaveLength(1);
    });

    it("should pass params correctly", async () => {
      mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        expect(body.params).toEqual(["Alice", 25]);

        return new Response(
          JSON.stringify({ ok: true, data: { columns: [], rows: [] } }),
          { status: 200 }
        );
      });

      const client = new TalonClient();
      const res = await client.sql(
        "SELECT * FROM users WHERE name = ? AND age > ?",
        ["Alice", 25]
      );
      expect(res.ok).toBe(true);
    });

    it("should handle HTTP error response", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({ ok: false, error: "Table not found" }),
          { status: 404 }
        );
      });

      const client = new TalonClient();
      const res = await client.sql("SELECT * FROM nonexistent");
      expect(res.error).toBe("Table not found");
    });

    it("should handle HTTP error without error body", async () => {
      mockFetch(async () => {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500,
          statusText: "Internal Server Error",
        });
      });

      const client = new TalonClient();
      const res = await client.sql("BAD SQL");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("500");
    });
  });

  describe("execute()", () => {
    it("should send correct POST to /api/execute", async () => {
      mockFetch(async (url, init) => {
        expect(url).toContain("/api/execute");
        const body = JSON.parse(init?.body as string);
        expect(body.module).toBe("kv");
        expect(body.action).toBe("get");
        expect(body.params.key).toBe("test");

        return new Response(
          JSON.stringify({ ok: true, data: "hello" }),
          { status: 200 }
        );
      });

      const client = new TalonClient();
      const res = await client.execute("kv", "get", { key: "test" });
      expect(res.ok).toBe(true);
      expect(res.data).toBe("hello");
    });
  });

  describe("health()", () => {
    it("should call /api/health", async () => {
      mockFetch(async (url) => {
        expect(url).toContain("/api/health");
        return new Response(
          JSON.stringify({ ok: true, data: { status: "ok", version: "1.0" } }),
          { status: 200 }
        );
      });

      const client = new TalonClient();
      const res = await client.health();
      expect(res.ok).toBe(true);
      expect(res.data?.status).toBe("ok");
    });

    it("should handle unreachable server", async () => {
      mockFetch(async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      });

      const client = new TalonClient();
      const res = await client.health();
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Cannot reach");
    });
  });

  describe("connection error handling", () => {
    it("should return friendly message for ECONNREFUSED", async () => {
      mockFetch(async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      });

      const client = new TalonClient();
      const res = await client.sql("SELECT 1");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Cannot connect");
      expect(res.error).toContain("talon-server");
    });

    it("should handle timeout via AbortError", async () => {
      mockFetch(async (_url, init) => {
        // 模拟：信号被中止
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      });

      const client = new TalonClient({ timeout: 100 });
      const res = await client.sql("SELECT SLEEP(999)");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("timed out");
    });
  });
});

describe("formatError", () => {
  it("should wrap error string in MCP content format", () => {
    const result = formatError("something broke");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Error:");
    expect(result.content[0].text).toContain("something broke");
  });
});

describe("formatResult", () => {
  it("should serialize object to JSON", () => {
    const result = formatResult({ count: 42 });
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(42);
  });

  it("should pass through strings directly", () => {
    const result = formatResult("hello world");
    expect(result.content[0].text).toBe("hello world");
  });
});
