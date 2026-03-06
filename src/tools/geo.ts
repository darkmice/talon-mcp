import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerGeoTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_geo_search",
    {
      title: "Talon GEO Search",
      description: `Search for nearby members within a radius from a point in a Talon GEO index.

Args:
  - name (string): GEO index name
  - lng (number): Longitude of center point
  - lat (number): Latitude of center point
  - radius (number): Search radius
  - unit (string, optional): Distance unit — "m" (meters, default), "km", "mi", "ft"
  - limit (number, optional): Maximum results (default: 10)

Returns: { name: string, results: Array<{ member: string, distance: number, lng: number, lat: number }>, count: number }`,
      inputSchema: {
        name: z.string().min(1).describe("GEO index name"),
        lng: z.number().min(-180).max(180).describe("Longitude"),
        lat: z.number().min(-90).max(90).describe("Latitude"),
        radius: z.number().positive().describe("Search radius"),
        unit: z.enum(["m", "km", "mi", "ft"]).default("m").describe("Distance unit"),
        limit: z.number().int().min(1).max(1000).default(10).describe("Maximum results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("geo", "search", {
        name: args.name,
        lng: args.lng,
        lat: args.lat,
        radius: args.radius,
        unit: args.unit,
        limit: args.limit,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "GEO search failed");

      const results = Array.isArray(res.data) ? res.data : [];
      return formatResult({ name: args.name, results, count: results.length });
    }
  );

  server.registerTool(
    "talon_geo_add",
    {
      title: "Talon GEO Add",
      description: `Add a member with coordinates to a Talon GEO index.

Args:
  - name (string): GEO index name
  - member (string): Member key/name
  - lng (number): Longitude
  - lat (number): Latitude

Returns: { name: string, member: string, message: string }`,
      inputSchema: {
        name: z.string().min(1).describe("GEO index name"),
        member: z.string().min(1).describe("Member key/name"),
        lng: z.number().min(-180).max(180).describe("Longitude"),
        lat: z.number().min(-90).max(90).describe("Latitude"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("geo", "add", {
        name: args.name,
        member: args.member,
        lng: args.lng,
        lat: args.lat,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "GEO add failed");

      return formatResult({ name: args.name, member: args.member, message: "Added" });
    }
  );

  server.registerTool(
    "talon_geo_create",
    {
      title: "Talon Create GEO Index",
      description: `Create a new GEO spatial index in Talon.

Args:
  - name (string): GEO index name

Returns: { name: string, message: string }`,
      inputSchema: {
        name: z.string().min(1).describe("GEO index name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("geo", "create", { name: args.name });
      if (!res.ok || res.error) return formatError(res.error ?? "Create GEO index failed");

      return formatResult({ name: args.name, message: "GEO index created" });
    }
  );
}
