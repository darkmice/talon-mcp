#!/usr/bin/env node

/**
 * Talon MCP Server
 *
 * MCP (Model Context Protocol) server for the Talon multi-model data engine.
 * Provides AI agents with direct access to all 9 Talon engines:
 * SQL, KV, Vector, TimeSeries, MessageQueue, Full-Text Search, GEO, Graph, AI.
 *
 * Usage:
 *   TALON_URL=http://localhost:8080 node dist/index.js
 *
 * Environment variables:
 *   TALON_URL      — Talon server HTTP endpoint (default: http://localhost:8080)
 *   TALON_TIMEOUT  — Request timeout in ms (default: 30000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerSqlTools } from "./tools/sql.js";
import { registerKvTools } from "./tools/kv.js";
import { registerVectorTools } from "./tools/vector.js";
import { registerTimeseriesTools } from "./tools/timeseries.js";
import { registerMqTools } from "./tools/mq.js";
import { registerFtsTools } from "./tools/fts.js";
import { registerGeoTools } from "./tools/geo.js";
import { registerGraphTools } from "./tools/graph.js";
import { registerAiTools } from "./tools/ai.js";
import { registerAdminTools } from "./tools/admin.js";

const server = new McpServer({
  name: "talon-mcp-server",
  version: "1.0.0",
});

registerSqlTools(server);
registerKvTools(server);
registerVectorTools(server);
registerTimeseriesTools(server);
registerMqTools(server);
registerFtsTools(server);
registerGeoTools(server);
registerGraphTools(server);
registerAiTools(server);
registerAdminTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Talon MCP Server running (stdio) → ${process.env.TALON_URL || "http://localhost:8080"}`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
