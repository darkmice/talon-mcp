/**
 * MCP Capability Bridge Contract — regression tests.
 *
 * Covers: registration, discovery, invocation lifecycle,
 * failure semantics, bridge assembly, capability filtering.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CapabilityBridge,
  assembleBridge,
  TALON_CAPABILITY_CATALOG,
  connectionError,
  timeoutError,
  serverError,
  validationError,
  notFoundError,
  unavailableError,
  type CapabilityDescriptor,
  type HookLifecycleEvent,
  type InvocationRequest,
  type InvocationResult,
} from "./bridge.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeDescriptor(overrides?: Partial<CapabilityDescriptor>): CapabilityDescriptor {
  return {
    toolName: "test_tool",
    engine: "kv",
    description: "Test tool",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<InvocationRequest>): InvocationRequest {
  return {
    toolName: "test_tool",
    args: {},
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Registration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CapabilityBridge — registration", () => {
  let bridge: CapabilityBridge;

  beforeEach(() => {
    bridge = new CapabilityBridge();
  });

  it("should register a capability", () => {
    bridge.register(makeDescriptor());
    expect(bridge.size).toBe(1);
    expect(bridge.has("test_tool")).toBe(true);
  });

  it("should register multiple capabilities at once", () => {
    bridge.registerAll([
      makeDescriptor({ toolName: "a" }),
      makeDescriptor({ toolName: "b" }),
    ]);
    expect(bridge.size).toBe(2);
  });

  it("should overwrite duplicate tool names", () => {
    bridge.register(makeDescriptor({ description: "v1" }));
    bridge.register(makeDescriptor({ description: "v2" }));
    expect(bridge.size).toBe(1);
    expect(bridge.getDescriptor("test_tool")?.description).toBe("v2");
  });

  it("should list all registered capabilities", () => {
    bridge.registerAll([
      makeDescriptor({ toolName: "a" }),
      makeDescriptor({ toolName: "b" }),
    ]);
    const list = bridge.listCapabilities();
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.toolName).sort()).toEqual(["a", "b"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discovery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CapabilityBridge — discovery", () => {
  let bridge: CapabilityBridge;

  beforeEach(() => {
    bridge = new CapabilityBridge();
    bridge.register(makeDescriptor());
  });

  it("registered but undiscovered capability is not available", () => {
    expect(bridge.has("test_tool")).toBe(true);
    expect(bridge.isAvailable("test_tool")).toBe(false);
  });

  it("marking discovered makes capability available", () => {
    bridge.markDiscovered("test_tool");
    expect(bridge.isAvailable("test_tool")).toBe(true);
    expect(bridge.discoveredCount).toBe(1);
  });

  it("marking unknown tool discovered is a no-op", () => {
    bridge.markDiscovered("unknown");
    expect(bridge.discoveredCount).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Filtering
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CapabilityBridge — filtering", () => {
  let bridge: CapabilityBridge;

  beforeEach(() => {
    bridge = new CapabilityBridge();
    bridge.registerAll([
      makeDescriptor({ toolName: "sql_q", engine: "sql", access: "read" }),
      makeDescriptor({ toolName: "sql_e", engine: "sql", access: "write" }),
      makeDescriptor({ toolName: "kv_op", engine: "kv", access: "write" }),
      makeDescriptor({ toolName: "admin_op", engine: "admin", access: "admin" }),
    ]);
  });

  it("should filter by engine", () => {
    const sqlCaps = bridge.listByEngine("sql");
    expect(sqlCaps).toHaveLength(2);
    expect(sqlCaps.every((c) => c.engine === "sql")).toBe(true);
  });

  it("should filter by access level", () => {
    const reads = bridge.listByAccess("read");
    expect(reads).toHaveLength(1);
    expect(reads[0].toolName).toBe("sql_q");
  });

  it("should return empty for engines with no capabilities", () => {
    expect(bridge.listByEngine("vector")).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CapabilityBridge — validation", () => {
  let bridge: CapabilityBridge;

  beforeEach(() => {
    bridge = new CapabilityBridge();
    bridge.register(makeDescriptor());
    bridge.markDiscovered("test_tool");
  });

  it("should pass validation for available capability", () => {
    expect(bridge.validateRequest(makeRequest())).toBeUndefined();
  });

  it("should reject not-found capability", () => {
    const err = bridge.validateRequest(makeRequest({ toolName: "unknown" }));
    expect(err).toBeDefined();
    expect(err!.kind).toBe("not_found");
    expect(err!.retryable).toBe(false);
  });

  it("should reject undiscovered capability", () => {
    bridge.register(makeDescriptor({ toolName: "new_tool" }));
    const err = bridge.validateRequest(makeRequest({ toolName: "new_tool" }));
    expect(err).toBeDefined();
    expect(err!.kind).toBe("unavailable");
    expect(err!.retryable).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook Lifecycle Events
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CapabilityBridge — hook lifecycle", () => {
  let bridge: CapabilityBridge;
  let events: HookLifecycleEvent[];

  beforeEach(() => {
    bridge = new CapabilityBridge();
    events = [];
    bridge.onHookEvent((e) => events.push(e));
  });

  it("should emit registered event on register", () => {
    bridge.register(makeDescriptor());
    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe("registered");
    expect(events[0].toolName).toBe("test_tool");
  });

  it("should emit discovered event on markDiscovered", () => {
    bridge.register(makeDescriptor());
    bridge.markDiscovered("test_tool");
    expect(events).toHaveLength(2);
    expect(events[1].phase).toBe("discovered");
  });

  it("should emit invoked then completed on successful invocation", () => {
    bridge.register(makeDescriptor());
    bridge.markDiscovered("test_tool");
    events.length = 0;

    const finish = bridge.startInvocation(makeRequest());
    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe("invoked");

    const result: InvocationResult = {
      ok: true,
      toolName: "test_tool",
      data: { rows: [] },
      durationMs: 42,
    };
    finish(result);
    expect(events).toHaveLength(2);
    expect(events[1].phase).toBe("completed");
  });

  it("should emit invoked then failed on error", () => {
    bridge.register(makeDescriptor());
    bridge.markDiscovered("test_tool");
    events.length = 0;

    const finish = bridge.startInvocation(makeRequest());
    const result: InvocationResult = {
      ok: false,
      toolName: "test_tool",
      error: timeoutError("timed out"),
      durationMs: 30000,
    };
    finish(result);
    expect(events).toHaveLength(2);
    expect(events[1].phase).toBe("failed");
    expect(events[1].error?.kind).toBe("timeout");
  });

  it("should allow unsubscribing from events", () => {
    const unsub = bridge.onHookEvent(() => {});
    // We already have one listener from beforeEach, plus this one
    bridge.register(makeDescriptor());
    expect(events).toHaveLength(1);

    unsub();
    bridge.register(makeDescriptor({ toolName: "other" }));
    // Original listener still fires
    expect(events).toHaveLength(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error constructors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("BridgeError constructors", () => {
  it("connectionError is retryable", () => {
    const err = connectionError("ECONNREFUSED", "fetch failed");
    expect(err.kind).toBe("connection");
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe("fetch failed");
  });

  it("timeoutError is retryable", () => {
    const err = timeoutError("30s exceeded");
    expect(err.kind).toBe("timeout");
    expect(err.retryable).toBe(true);
  });

  it("serverError is not retryable", () => {
    const err = serverError("500 Internal Server Error");
    expect(err.kind).toBe("server");
    expect(err.retryable).toBe(false);
  });

  it("validationError is not retryable", () => {
    const err = validationError("missing required field");
    expect(err.kind).toBe("validation");
    expect(err.retryable).toBe(false);
  });

  it("notFoundError includes tool name", () => {
    const err = notFoundError("my_tool");
    expect(err.kind).toBe("not_found");
    expect(err.message).toContain("my_tool");
  });

  it("unavailableError is retryable", () => {
    const err = unavailableError("my_tool", "server unreachable");
    expect(err.kind).toBe("unavailable");
    expect(err.retryable).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bridge Assembly
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assembleBridge", () => {
  it("should create bridge with full Talon catalog", () => {
    const bridge = assembleBridge();
    expect(bridge.size).toBe(TALON_CAPABILITY_CATALOG.length);
    expect(bridge.discoveredCount).toBe(TALON_CAPABILITY_CATALOG.length);
  });

  it("should auto-discover all capabilities by default", () => {
    const bridge = assembleBridge();
    for (const cap of TALON_CAPABILITY_CATALOG) {
      expect(bridge.isAvailable(cap.toolName)).toBe(true);
    }
  });

  it("should skip auto-discover when configured", () => {
    const bridge = assembleBridge({ autoDiscover: false });
    expect(bridge.size).toBe(TALON_CAPABILITY_CATALOG.length);
    expect(bridge.discoveredCount).toBe(0);
    for (const cap of TALON_CAPABILITY_CATALOG) {
      expect(bridge.isAvailable(cap.toolName)).toBe(false);
    }
  });

  it("should register all expected engines", () => {
    const bridge = assembleBridge();
    const engines = new Set(bridge.listCapabilities().map((c) => c.engine));
    expect(engines).toContain("sql");
    expect(engines).toContain("kv");
    expect(engines).toContain("vector");
    expect(engines).toContain("ai");
    expect(engines).toContain("admin");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Catalog contract stability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TALON_CAPABILITY_CATALOG", () => {
  it("should have unique tool names", () => {
    const names = TALON_CAPABILITY_CATALOG.map((c) => c.toolName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry has required fields", () => {
    for (const cap of TALON_CAPABILITY_CATALOG) {
      expect(cap.toolName).toBeTruthy();
      expect(cap.engine).toBeTruthy();
      expect(cap.description).toBeTruthy();
      expect(cap.access).toBeTruthy();
      expect(typeof cap.concurrencySafe).toBe("boolean");
      expect(typeof cap.idempotent).toBe("boolean");
    }
  });

  it("sql_query is read-only and idempotent", () => {
    const sqlQuery = TALON_CAPABILITY_CATALOG.find(
      (c) => c.toolName === "talon_sql_query"
    );
    expect(sqlQuery).toBeDefined();
    expect(sqlQuery!.access).toBe("read");
    expect(sqlQuery!.idempotent).toBe(true);
  });

  it("admin is admin-level access", () => {
    const admin = TALON_CAPABILITY_CATALOG.find(
      (c) => c.toolName === "talon_admin"
    );
    expect(admin).toBeDefined();
    expect(admin!.access).toBe("admin");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Timeout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CapabilityBridge — timeout", () => {
  it("should use default timeout when none specified", () => {
    const bridge = new CapabilityBridge({ defaultTimeoutMs: 5000 });
    expect(bridge.getTimeout(makeRequest())).toBe(5000);
  });

  it("should use request-level timeout override", () => {
    const bridge = new CapabilityBridge({ defaultTimeoutMs: 5000 });
    expect(bridge.getTimeout(makeRequest({ timeoutMs: 1000 }))).toBe(1000);
  });
});
