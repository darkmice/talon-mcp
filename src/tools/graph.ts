import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerGraphTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_graph_query",
    {
      title: "Talon Graph Traversal",
      description: `Traverse a Talon property graph using BFS from a starting vertex.

Args:
  - graph (string): Graph name
  - start_vertex (number): Starting vertex ID
  - max_depth (number, optional): Maximum traversal depth (default: 3)
  - direction (string, optional): Traversal direction — "out" (default), "in", or "both"

Returns: { graph: string, vertices: number[], count: number }`,
      inputSchema: {
        graph: z.string().min(1).describe("Graph name"),
        start_vertex: z.number().int().describe("Starting vertex ID"),
        max_depth: z.number().int().min(1).max(100).default(3).describe("Max traversal depth"),
        direction: z.enum(["out", "in", "both"]).default("out").describe("Traversal direction"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("graph", "bfs", {
        graph: args.graph,
        start: args.start_vertex,
        max_depth: args.max_depth,
        direction: args.direction,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Graph traversal failed");

      const vertices = Array.isArray(res.data) ? res.data : [];
      return formatResult({ graph: args.graph, vertices, count: vertices.length });
    }
  );

  server.registerTool(
    "talon_graph_shortest_path",
    {
      title: "Talon Graph Shortest Path",
      description: `Find the shortest path between two vertices in a Talon graph.

Args:
  - graph (string): Graph name
  - from_vertex (number): Source vertex ID
  - to_vertex (number): Target vertex ID
  - direction (string, optional): Edge direction — "out" (default), "in", "both"

Returns: { graph: string, path: number[] | null, length: number }`,
      inputSchema: {
        graph: z.string().min(1).describe("Graph name"),
        from_vertex: z.number().int().describe("Source vertex ID"),
        to_vertex: z.number().int().describe("Target vertex ID"),
        direction: z.enum(["out", "in", "both"]).default("out").describe("Edge direction"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("graph", "shortest_path", {
        graph: args.graph,
        from: args.from_vertex,
        to: args.to_vertex,
        direction: args.direction,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Shortest path failed");

      const path = Array.isArray(res.data) ? res.data : null;
      return formatResult({
        graph: args.graph,
        path,
        length: path ? path.length - 1 : -1,
      });
    }
  );

  server.registerTool(
    "talon_graph_add_vertex",
    {
      title: "Talon Graph Add Vertex",
      description: `Add a vertex to a Talon property graph.

Args:
  - graph (string): Graph name
  - label (string, optional): Vertex label/type (e.g., "person", "document")
  - properties (object, optional): Vertex properties as key-value pairs

Returns: { graph: string, vertex_id: number }`,
      inputSchema: {
        graph: z.string().min(1).describe("Graph name"),
        label: z.string().optional().describe("Vertex label/type"),
        properties: z.record(z.unknown()).optional().describe("Vertex properties"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = { graph: args.graph };
      if (args.label) params.label = args.label;
      if (args.properties) params.properties = args.properties;

      const res = await client.execute("graph", "add_vertex", params);
      if (!res.ok || res.error) return formatError(res.error ?? "Add vertex failed");

      return formatResult({ graph: args.graph, vertex_id: res.data });
    }
  );

  server.registerTool(
    "talon_graph_add_edge",
    {
      title: "Talon Graph Add Edge",
      description: `Add a directed edge between two vertices in a Talon graph.

Args:
  - graph (string): Graph name
  - from_vertex (number): Source vertex ID
  - to_vertex (number): Target vertex ID
  - label (string, optional): Edge label/type (e.g., "knows", "follows", "contains")
  - properties (object, optional): Edge properties

Returns: { graph: string, edge_id: number }`,
      inputSchema: {
        graph: z.string().min(1).describe("Graph name"),
        from_vertex: z.number().int().describe("Source vertex ID"),
        to_vertex: z.number().int().describe("Target vertex ID"),
        label: z.string().optional().describe("Edge label/type"),
        properties: z.record(z.unknown()).optional().describe("Edge properties"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = {
        graph: args.graph,
        from: args.from_vertex,
        to: args.to_vertex,
      };
      if (args.label) params.label = args.label;
      if (args.properties) params.properties = args.properties;

      const res = await client.execute("graph", "add_edge", params);
      if (!res.ok || res.error) return formatError(res.error ?? "Add edge failed");

      return formatResult({ graph: args.graph, edge_id: res.data });
    }
  );

  server.registerTool(
    "talon_graph_create",
    {
      title: "Talon Create Graph",
      description: `Create a new property graph in Talon.

Args:
  - name (string): Graph name

Returns: { name: string, message: string }`,
      inputSchema: {
        name: z.string().min(1).describe("Graph name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("graph", "create", { name: args.name });
      if (!res.ok || res.error) return formatError(res.error ?? "Create graph failed");

      return formatResult({ name: args.name, message: "Graph created" });
    }
  );
}
