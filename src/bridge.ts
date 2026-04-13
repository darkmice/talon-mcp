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
  // SQL
  {
    toolName: "talon_sql_query",
    engine: "sql",
    description: "Execute SQL queries against Talon",
    access: "read",
    concurrencySafe: true,
    idempotent: true,
  },
  {
    toolName: "talon_sql_execute",
    engine: "sql",
    description: "Execute SQL DDL/DML statements",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  // KV
  {
    toolName: "talon_kv",
    engine: "kv",
    description: "Key-value operations (get, set, delete, list, batch)",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // Vector
  {
    toolName: "talon_vector",
    engine: "vector",
    description: "Vector embeddings and similarity search",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // TimeSeries
  {
    toolName: "talon_timeseries",
    engine: "timeseries",
    description: "Time-series data ingestion and range queries",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // MQ
  {
    toolName: "talon_mq",
    engine: "mq",
    description: "Message queue publish, consume, and management",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // FTS
  {
    toolName: "talon_fts",
    engine: "fts",
    description: "Full-text search indexing and queries",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // Geo
  {
    toolName: "talon_geo",
    engine: "geo",
    description: "Geospatial data storage and proximity queries",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // Graph
  {
    toolName: "talon_graph",
    engine: "graph",
    description: "Graph node/edge management and traversal",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // AI
  {
    toolName: "talon_ai_session",
    engine: "ai",
    description: "AI session management (create, history, append, context)",
    access: "write",
    concurrencySafe: false,
    idempotent: false,
  },
  {
    toolName: "talon_ai_memory",
    engine: "ai",
    description: "AI memory store/retrieve/search",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  {
    toolName: "talon_ai_rag",
    engine: "ai",
    description: "RAG document ingestion and retrieval",
    access: "write",
    concurrencySafe: true,
    idempotent: false,
  },
  // Admin
  {
    toolName: "talon_admin",
    engine: "admin",
    description: "Administrative operations (health, stats, config)",
    access: "admin",
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
