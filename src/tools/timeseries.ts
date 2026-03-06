import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerTimeseriesTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_ts_query",
    {
      title: "Talon TimeSeries Query",
      description: `Query time-series data from Talon. Supports time range filtering, ordering, and limit.

Args:
  - name (string): TimeSeries name (e.g., "metrics", "cpu_usage")
  - start (string, optional): Start time as ISO 8601 string (e.g., "2024-01-01T00:00:00Z")
  - end (string, optional): End time as ISO 8601 string
  - order_asc (boolean, optional): Sort ascending by timestamp (default: true)
  - limit (number, optional): Maximum data points to return (default: 100)

Returns: { name: string, points: Array<{ timestamp: number, values: number[] }>, count: number }`,
      inputSchema: {
        name: z.string().min(1).describe("TimeSeries name"),
        start: z.string().optional().describe("Start time (ISO 8601)"),
        end: z.string().optional().describe("End time (ISO 8601)"),
        order_asc: z.boolean().default(true).describe("Sort ascending by timestamp"),
        limit: z.number().int().min(1).max(10000).default(100).describe("Maximum data points"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = {
        name: args.name,
        order_asc: args.order_asc,
        limit: args.limit,
      };
      if (args.start) params.start = args.start;
      if (args.end) params.end = args.end;

      const res = await client.execute("ts", "query", params);
      if (!res.ok || res.error) return formatError(res.error ?? "TimeSeries query failed");

      const points = Array.isArray(res.data) ? res.data : [];
      return formatResult({ name: args.name, points, count: points.length });
    }
  );

  server.registerTool(
    "talon_ts_write",
    {
      title: "Talon TimeSeries Write",
      description: `Insert a data point into a Talon TimeSeries.

Args:
  - name (string): TimeSeries name
  - values (object): Field values as key-value pairs (e.g., {"cpu": 85.5, "mem": 4096})
  - tags (object, optional): Tag key-value pairs for grouping (e.g., {"host": "srv1"})
  - timestamp (string, optional): ISO 8601 timestamp (defaults to current time)

Returns: { name: string, message: string }

Examples:
  - name="metrics", values={"cpu": 85.5, "mem": 4096}, tags={"host": "server01"}`,
      inputSchema: {
        name: z.string().min(1).describe("TimeSeries name"),
        values: z.record(z.number()).describe("Field values as key-value pairs"),
        tags: z.record(z.string()).optional().describe("Tag key-value pairs for grouping"),
        timestamp: z.string().optional().describe("ISO 8601 timestamp (defaults to now)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = { name: args.name, values: args.values };
      if (args.tags) params.tags = args.tags;
      if (args.timestamp) params.timestamp = args.timestamp;

      const res = await client.execute("ts", "insert", params);
      if (!res.ok || res.error) return formatError(res.error ?? "TimeSeries write failed");

      return formatResult({ name: args.name, message: "Data point inserted" });
    }
  );

  server.registerTool(
    "talon_ts_create",
    {
      title: "Talon Create TimeSeries",
      description: `Create a new TimeSeries in Talon with tag and field definitions.

Args:
  - name (string): TimeSeries name
  - tags (string[]): Tag names for grouping (e.g., ["host", "region"])
  - fields (string[]): Field names for numeric values (e.g., ["cpu", "mem", "disk"])

Returns: { name: string, message: string }`,
      inputSchema: {
        name: z.string().min(1).describe("TimeSeries name"),
        tags: z.array(z.string()).describe("Tag names for grouping"),
        fields: z.array(z.string()).min(1).describe("Field names for numeric values"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("ts", "create", {
        name: args.name,
        tags: args.tags,
        fields: args.fields,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Create TimeSeries failed");

      return formatResult({ name: args.name, message: "TimeSeries created" });
    }
  );
}
