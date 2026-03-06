/**
 * Talon HTTP API Client
 *
 * Communicates with a running Talon server via its HTTP REST API.
 * Default endpoint: http://localhost:8080
 *
 * The Talon server exposes two main API patterns:
 *   POST /api/sql          — SQL queries with optional params
 *   POST /api/execute      — Unified JSON command for all engines
 */

export interface TalonConfig {
  baseUrl: string;
  timeout: number;
}

export interface TalonResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  rows_affected?: number;
}

export interface SqlResult {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rows_affected?: number;
}

const DEFAULT_CONFIG: TalonConfig = {
  baseUrl: "http://localhost:8080",
  timeout: 30_000,
};

export class TalonClient {
  private config: TalonConfig;

  constructor(config?: Partial<TalonConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>
  ): Promise<TalonResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = (await res.json()) as TalonResponse<T>;

      if (!res.ok && !json.error) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      return json;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: `Request timed out after ${this.config.timeout}ms` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return {
          ok: false,
          error: `Cannot connect to Talon server at ${this.config.baseUrl}. Is the server running? Start it with: ./talon-server --http-port 8080`,
        };
      }
      return { ok: false, error: `Request failed: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }

  async sql(sql: string, params?: unknown[]): Promise<TalonResponse<SqlResult>> {
    return this.request<SqlResult>("/api/sql", { sql, params: params ?? [] });
  }

  async execute(
    module: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<TalonResponse> {
    return this.request("/api/execute", { module, action, params });
  }

  async health(): Promise<TalonResponse<{ status: string; version?: string }>> {
    try {
      const url = `${this.config.baseUrl}/api/health`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);

      try {
        const res = await fetch(url, { signal: controller.signal });
        const json = (await res.json()) as TalonResponse<{ status: string; version?: string }>;
        return json;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return {
        ok: false,
        error: `Cannot reach Talon server at ${this.config.baseUrl}`,
      };
    }
  }
}

let clientInstance: TalonClient | null = null;

export function getTalonClient(): TalonClient {
  if (!clientInstance) {
    const baseUrl = process.env.TALON_URL || "http://localhost:8080";
    const timeout = parseInt(process.env.TALON_TIMEOUT || "30000", 10);
    clientInstance = new TalonClient({ baseUrl, timeout });
  }
  return clientInstance;
}

export function formatError(error: string): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: `Error: ${error}` }],
  };
}

export function formatResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text" as const, text }],
  };
}
