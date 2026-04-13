import { TalonClient, type TalonResponse } from "./client.js";

/**
 * MCP Capability Bridge Contract
 *
 * Stable contract layer between MCP server capabilities and runtime consumers
 * (talon-agent, talon-sandbox, or any host runtime).
 *
 * This module defines:
 * - Capability descriptors that runtimes can enumerate and filter
 * - Hook lifecycle (register → discover → invoke → audit)
 * - Failure semantics (timeout, connection, server error, validation)
 * - Bridge assembly for composing capability sets
 * - Runtime bridge for actual tool invocation through TalonClient
 *
 * The bridge is the single interface runtimes use to interact with MCP
 * capabilities. It decouples the MCP transport/protocol layer from the
 * runtime's tool execution plane.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Capability Descriptor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Engine modules available in the Talon MCP server. */
export type TalonEngine =
  | "sql"
  | "kv"
  | "vector"
  | "timeseries"
  | "mq"
  | "fts"
  | "geo"
  | "graph"
  | "ai"
  | "admin";

/** Read/write classification for capability safety hints. */
export type CapabilityAccess = "read" | "write" | "admin";

/** A single MCP capability descriptor. */
export interface CapabilityDescriptor {
  /** Stable tool name registered in MCP (e.g. "talon_sql_query"). */
  toolName: string;
  /** Which Talon engine module this capability belongs to. */
  engine: TalonEngine;
  /** Human-readable summary. */
  description: string;
  /** Read/write/admin classification. */
  access: CapabilityAccess;
  /** Whether this tool is safe to invoke in parallel. */
  concurrencySafe: boolean;
  /** Whether invocation is idempotent. */
  idempotent: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook Lifecycle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Hook lifecycle phases. */
export type HookPhase =
  | "registered"   // Capability declared but not yet validated
  | "discovered"   // Runtime confirmed the MCP server exposes this tool
  | "invoked"      // Tool invocation in progress
  | "completed"    // Invocation succeeded
  | "failed";      // Invocation failed

/** A lifecycle event emitted by the bridge during hook transitions. */
export interface HookLifecycleEvent {
  /** Which capability this event is about. */
  toolName: string;
  /** Current phase. */
  phase: HookPhase;
  /** Monotonic timestamp (ms). */
  timestampMs: number;
  /** Optional error if phase is "failed". */
  error?: BridgeError;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Failure Semantics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Canonical bridge error kinds. */
export type BridgeErrorKind =
  | "connection"   // Cannot reach the MCP server
  | "timeout"      // Invocation exceeded timeout
  | "server"       // MCP server returned an error
  | "validation"   // Input schema validation failed
  | "not_found"    // Requested capability is not registered
  | "unavailable"; // Capability was registered but discovery failed

/** Structured bridge error. */
export interface BridgeError {
  kind: BridgeErrorKind;
  message: string;
  /** Whether the caller should retry. */
  retryable: boolean;
  /** Optional upstream error detail. */
  cause?: string;
}

/** Create a retryable connection error. */
export function connectionError(message: string, cause?: string): BridgeError {
  return { kind: "connection", message, retryable: true, cause };
}

/** Create a retryable timeout error. */
export function timeoutError(message: string, cause?: string): BridgeError {
  return { kind: "timeout", message, retryable: true, cause };
}

/** Create a non-retryable server error. */
export function serverError(message: string, cause?: string): BridgeError {
  return { kind: "server", message, retryable: false, cause };
}

/** Create a non-retryable validation error. */
export function validationError(message: string, cause?: string): BridgeError {
  return { kind: "validation", message, retryable: false, cause };
}

/** Create a non-retryable not-found error. */
export function notFoundError(toolName: string): BridgeError {
  return {
    kind: "not_found",
    message: `Capability "${toolName}" is not registered in the bridge`,
    retryable: false,
  };
}

/** Create a retryable unavailable error. */
export function unavailableError(toolName: string, cause?: string): BridgeError {
  return {
    kind: "unavailable",
    message: `Capability "${toolName}" registered but not available on MCP server`,
    retryable: true,
    cause,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Invocation Contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Input for a capability invocation. */
export interface InvocationRequest {
  toolName: string;
  args: Record<string, unknown>;
  /** Caller-supplied correlation ID for cross-subsystem tracing. */
  correlationId?: string;
  /** Timeout override (ms). Defaults to bridge-level timeout. */
  timeoutMs?: number;
}

/** Successful invocation result. */
export interface InvocationSuccess {
  ok: true;
  toolName: string;
  data: unknown;
  durationMs: number;
}

/** Failed invocation result. */
export interface InvocationFailure {
  ok: false;
  toolName: string;
  error: BridgeError;
  durationMs: number;
}

/** Union result type for capability invocation. */
export type InvocationResult = InvocationSuccess | InvocationFailure;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Capability Bridge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Listener for hook lifecycle events. */
export type HookEventListener = (event: HookLifecycleEvent) => void;

/** Configuration for the capability bridge. */
export interface BridgeConfig {
  /** Default invocation timeout (ms). */
  defaultTimeoutMs: number;
  /** Whether to auto-discover capabilities at assembly time. */
  autoDiscover: boolean;
}

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  defaultTimeoutMs: 30_000,
  autoDiscover: true,
};

/**
 * Capability Bridge — the single interface runtimes use to interact
 * with MCP capabilities.
 *
 * Lifecycle: assemble → register capabilities → discover → invoke.
 */
export class CapabilityBridge {
  private capabilities: Map<string, CapabilityDescriptor> = new Map();
  private discovered: Set<string> = new Set();
  private listeners: HookEventListener[] = [];
  private config: BridgeConfig;

  constructor(config?: Partial<BridgeConfig>) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
  }

  /** Register a capability descriptor. */
  register(descriptor: CapabilityDescriptor): void {
    this.capabilities.set(descriptor.toolName, descriptor);
    this.emit({
      toolName: descriptor.toolName,
      phase: "registered",
      timestampMs: Date.now(),
    });
  }

  /** Register multiple capabilities at once. */
  registerAll(descriptors: CapabilityDescriptor[]): void {
    for (const d of descriptors) {
      this.register(d);
    }
  }

  /** Mark a capability as discovered (MCP server confirmed it exists). */
  markDiscovered(toolName: string): void {
    if (!this.capabilities.has(toolName)) return;
    this.discovered.add(toolName);
    this.emit({
      toolName,
      phase: "discovered",
      timestampMs: Date.now(),
    });
  }

  /** Get all registered capability descriptors. */
  listCapabilities(): CapabilityDescriptor[] {
    return Array.from(this.capabilities.values());
  }

  /** Get capabilities filtered by engine. */
  listByEngine(engine: TalonEngine): CapabilityDescriptor[] {
    return this.listCapabilities().filter((c) => c.engine === engine);
  }

  /** Get capabilities filtered by access level. */
  listByAccess(access: CapabilityAccess): CapabilityDescriptor[] {
    return this.listCapabilities().filter((c) => c.access === access);
  }

  /** Check if a capability is registered. */
  has(toolName: string): boolean {
    return this.capabilities.has(toolName);
  }

  /** Check if a capability is both registered and discovered. */
  isAvailable(toolName: string): boolean {
    return this.capabilities.has(toolName) && this.discovered.has(toolName);
  }

  /** Get the descriptor for a capability. */
  getDescriptor(toolName: string): CapabilityDescriptor | undefined {
    return this.capabilities.get(toolName);
  }

  /** Get bridge timeout for a given invocation request. */
  getTimeout(request: InvocationRequest): number {
    return request.timeoutMs ?? this.config.defaultTimeoutMs;
  }

  /** Subscribe to hook lifecycle events. */
  onHookEvent(listener: HookEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Validate an invocation request before execution.
   *
   * Returns a BridgeError if the request is invalid, or undefined if valid.
   * This is a pre-flight check — the caller is expected to call this
   * before actually invoking the MCP tool.
   */
  validateRequest(request: InvocationRequest): BridgeError | undefined {
    if (!this.capabilities.has(request.toolName)) {
      return notFoundError(request.toolName);
    }
    if (!this.discovered.has(request.toolName)) {
      return unavailableError(request.toolName);
    }
    return undefined;
  }

  /**
   * Record the start of an invocation (emits lifecycle event).
   * Returns a function to record completion.
   */
  startInvocation(
    request: InvocationRequest
  ): (result: InvocationResult) => void {
    const startMs = Date.now();
    this.emit({
      toolName: request.toolName,
      phase: "invoked",
      timestampMs: startMs,
    });

    return (result: InvocationResult) => {
      if (result.ok) {
        this.emit({
          toolName: request.toolName,
          phase: "completed",
          timestampMs: Date.now(),
        });
      } else {
        this.emit({
          toolName: request.toolName,
          phase: "failed",
          timestampMs: Date.now(),
          error: result.error,
        });
      }
    };
  }

  /** Number of registered capabilities. */
  get size(): number {
    return this.capabilities.size;
  }

  /** Number of discovered (available) capabilities. */
  get discoveredCount(): number {
    return this.discovered.size;
  }

  private emit(event: HookLifecycleEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Built-in capability catalog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** All capabilities exposed by the standard Talon MCP server. */
export const TALON_CAPABILITY_CATALOG: CapabilityDescriptor[] = [
  // ── ai ──
  {
    toolName: "talon_ai_memory",
    engine: "ai",
    description: "Manage AI memories — store and search semantic memories for a session.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_ai_session",
    engine: "ai",
    description: "Manage AI sessions — create, get history, append messages, manage context windows.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },

  // ── admin ──
  {
    toolName: "talon_describe_table",
    engine: "admin",
    description: "Get the schema/column definitions for a specific table.",
    access: "admin",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_list_tables",
    engine: "admin",
    description: "List all tables in the Talon database.",
    access: "admin",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_persist",
    engine: "admin",
    description: "Force flush all in-memory data to disk.",
    access: "admin",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_raw_execute",
    engine: "admin",
    description: "Execute a raw command against the Talon engine.",
    access: "admin",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_server_info",
    engine: "admin",
    description: "Get Talon server status, version, and database statistics.",
    access: "admin",
    concurrencySafe: true,
    idempotent: true,
  },

  // ── fts ──
  {
    toolName: "talon_fts_create_index",
    engine: "fts",
    description: "Create a new full-text search index.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_fts_hybrid_search",
    engine: "fts",
    description: "Perform hybrid search combining BM25 and vector similarity using RRF.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_fts_index_doc",
    engine: "fts",
    description: "Index a document into a full-text search index.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_fts_search",
    engine: "fts",
    description: "Perform full-text search with BM25 scoring.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },

  // ── geo ──
  {
    toolName: "talon_geo_add",
    engine: "geo",
    description: "Add a member with coordinates to a GEO index.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_geo_create",
    engine: "geo",
    description: "Create a new GEO spatial index.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_geo_search",
    engine: "geo",
    description: "Search for nearby members within a radius from a point.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },

  // ── graph ──
  {
    toolName: "talon_graph_add_edge",
    engine: "graph",
    description: "Add a directed edge between two vertices.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_graph_add_vertex",
    engine: "graph",
    description: "Add a vertex to a property graph.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_graph_create",
    engine: "graph",
    description: "Create a new property graph.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_graph_query",
    engine: "graph",
    description: "Traverse a property graph using BFS from a starting vertex.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_graph_shortest_path",
    engine: "graph",
    description: "Find the shortest path between two vertices.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },

  // ── kv ──
  {
    toolName: "talon_kv_delete",
    engine: "kv",
    description: "Delete a key from KV store.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_kv_get",
    engine: "kv",
    description: "Get a value from KV store by key.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_kv_incr",
    engine: "kv",
    description: "Atomically increment a numeric value in KV store.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_kv_mget",
    engine: "kv",
    description: "Get multiple values from KV store in a single request.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_kv_scan",
    engine: "kv",
    description: "Scan keys in KV store by prefix with pagination.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_kv_set",
    engine: "kv",
    description: "Set a key-value pair in KV store with optional TTL.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },

  // ── mq ──
  {
    toolName: "talon_mq_ack",
    engine: "mq",
    description: "Acknowledge a consumed message.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_mq_create_topic",
    engine: "mq",
    description: "Create a new message queue topic.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_mq_list_topics",
    engine: "mq",
    description: "List all message queue topics.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_mq_poll",
    engine: "mq",
    description: "Poll messages from a topic using consumer group pattern.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_mq_publish",
    engine: "mq",
    description: "Publish a message to a topic.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },

  // ── sql ──
  {
    toolName: "talon_sql_execute",
    engine: "sql",
    description: "Execute a SQL statement that modifies the database (DDL or DML).",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_sql_query",
    engine: "sql",
    description: "Execute a read-only SQL query and return results.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },

  // ── timeseries ──
  {
    toolName: "talon_ts_create",
    engine: "timeseries",
    description: "Create a new TimeSeries with tag and field definitions.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_ts_query",
    engine: "timeseries",
    description: "Query time-series data with time range and aggregation.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_ts_write",
    engine: "timeseries",
    description: "Insert a data point into a TimeSeries.",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },

  // ── vector ──
  {
    toolName: "talon_vector_create_index",
    engine: "vector",
    description: "Create a new HNSW vector index.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_vector_insert",
    engine: "vector",
    description: "Insert a vector into an HNSW index.",
    access: "write",
    concurrencySafe: false,
    idempotent: true,
  },
  {
    toolName: "talon_vector_search",
    engine: "vector",
    description: "Perform vector similarity search using HNSW index.",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
];

/**
 * Assemble a capability bridge with the standard Talon catalog.
 *
 * If `autoDiscover` is true (default), all capabilities are immediately
 * marked as discovered — meaning the bridge assumes the MCP server
 * exposes the full standard catalog. Runtimes that need strict discovery
 * should set `autoDiscover: false` and call `markDiscovered()` after
 * confirming each tool with the MCP server.
 */
export function assembleBridge(config?: Partial<BridgeConfig>): CapabilityBridge {
  const bridge = new CapabilityBridge(config);
  bridge.registerAll(TALON_CAPABILITY_CATALOG);
  if (bridge["config"].autoDiscover) {
    for (const cap of TALON_CAPABILITY_CATALOG) {
      bridge.markDiscovered(cap.toolName);
    }
  }
  return bridge;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tool Router — maps capability names to TalonClient calls
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Route a capability invocation to the TalonClient.
 *
 * Each tool name is mapped to the appropriate client method.
 * - SQL tools → client.sql()
 * - Admin tools with SQL semantics → client.sql() or client.execute()
 * - All other engines → client.execute(module, action, params)
 */
async function routeInvocation(
  client: TalonClient,
  toolName: string,
  args: Record<string, unknown>
): Promise<TalonResponse> {
  switch (toolName) {
    // SQL — direct passthrough
    case "talon_sql_query":
    case "talon_sql_execute":
      return client.sql(
        args.sql as string,
        args.params as unknown[] | undefined
      );

    // Admin tools that use SQL under the hood
    case "talon_list_tables":
      return client.sql("SHOW TABLES");
    case "talon_describe_table":
      return client.sql(`DESCRIBE ${args.table as string}`);

    // Admin tools that use execute
    case "talon_server_info":
      return client.execute("admin", "info", {});
    case "talon_persist":
      return client.execute("admin", "persist", {});
    case "talon_raw_execute":
      return client.execute("admin", "raw", args);

    // All other engines use the unified execute endpoint.
    // Tool name convention: talon_{engine}_{action}
    default: {
      const segments = toolName.replace(/^talon_/, "").split("_");
      const module = segments[0];
      const action = segments.length > 1
        ? segments.slice(1).join("_")
        : (args.action as string) ?? "default";
      return client.execute(module, action, args);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Runtime Bridge — bridge + actual invocation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Configuration for the runtime bridge. */
export interface RuntimeBridgeConfig extends BridgeConfig {
  /** Talon server base URL. */
  talonUrl?: string;
  /** Talon request timeout (ms). */
  talonTimeout?: number;
}

/**
 * Runtime Bridge — a CapabilityBridge that can actually invoke tools.
 *
 * This is what runtimes (talon-agent, talon-sandbox) use to execute
 * MCP capabilities against a real Talon server.
 */
export class RuntimeBridge extends CapabilityBridge {
  private client: TalonClient;

  constructor(client: TalonClient, config?: Partial<BridgeConfig>) {
    super(config);
    this.client = client;
  }

  /**
   * Invoke a capability and return the result.
   *
   * Full lifecycle: validate → emit invoked → route to TalonClient → emit completed/failed.
   */
  async invoke(request: InvocationRequest): Promise<InvocationResult> {
    // Pre-flight validation
    const preflightError = this.validateRequest(request);
    if (preflightError) {
      return {
        ok: false,
        toolName: request.toolName,
        error: preflightError,
        durationMs: 0,
      };
    }

    // Start lifecycle tracking
    const completeInvocation = this.startInvocation(request);
    const startMs = Date.now();

    try {
      // Apply timeout
      const timeoutMs = this.getTimeout(request);
      const response = await Promise.race([
        routeInvocation(this.client, request.toolName, request.args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("BRIDGE_TIMEOUT")), timeoutMs)
        ),
      ]);

      const durationMs = Date.now() - startMs;

      if (response.ok) {
        const result: InvocationResult = {
          ok: true,
          toolName: request.toolName,
          data: response.data ?? response,
          durationMs,
        };
        completeInvocation(result);
        return result;
      } else {
        const result: InvocationResult = {
          ok: false,
          toolName: request.toolName,
          error: serverError(response.error ?? "Unknown server error"),
          durationMs,
        };
        completeInvocation(result);
        return result;
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      const msg = err instanceof Error ? err.message : String(err);

      let error;
      if (msg === "BRIDGE_TIMEOUT") {
        error = timeoutError(
          `Invocation of "${request.toolName}" timed out after ${this.getTimeout(request)}ms`
        );
      } else if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        error = connectionError(
          `Cannot reach Talon server for "${request.toolName}"`,
          msg
        );
      } else {
        error = serverError(`Invocation failed: ${msg}`, msg);
      }

      const result: InvocationResult = {
        ok: false,
        toolName: request.toolName,
        error,
        durationMs,
      };
      completeInvocation(result);
      return result;
    }
  }
}

/**
 * Assemble a runtime bridge wired to a real TalonClient.
 *
 * This is the main entry point for runtimes that want to invoke
 * MCP capabilities against a Talon server.
 */
export function assembleRuntimeBridge(
  config?: Partial<RuntimeBridgeConfig>
): RuntimeBridge {
  const client = new TalonClient({
    baseUrl: config?.talonUrl ?? process.env.TALON_URL ?? "http://localhost:8080",
    timeout: config?.talonTimeout ?? parseInt(process.env.TALON_TIMEOUT ?? "30000", 10),
  });

  const bridge = new RuntimeBridge(client, {
    defaultTimeoutMs: config?.defaultTimeoutMs ?? 30_000,
    autoDiscover: config?.autoDiscover ?? true,
  });

  bridge.registerAll(TALON_CAPABILITY_CATALOG);

  if (bridge["config"].autoDiscover) {
    for (const cap of TALON_CAPABILITY_CATALOG) {
      bridge.markDiscovered(cap.toolName);
    }
  }

  return bridge;
}
