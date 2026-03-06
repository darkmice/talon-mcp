import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerAiTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_ai_session",
    {
      title: "Talon AI Session Management",
      description: `Manage AI sessions in Talon — create, get history, append messages, manage context windows.

Actions:
  - "create": Create a new AI session
  - "get_history": Get message history for a session
  - "append": Append a message to a session
  - "context_window": Get context window with token budget

Args:
  - action (string): One of "create", "get_history", "append", "context_window"
  - session_id (string): Session identifier
  - message (object, optional): Message to append (required for "append") — { role: "user"|"assistant"|"system", content: string }
  - token_budget (number, optional): Token budget for context_window (default: 4096)

Returns: Varies by action`,
      inputSchema: {
        action: z
          .enum(["create", "get_history", "append", "context_window"])
          .describe("Session action"),
        session_id: z.string().min(1).describe("Session identifier"),
        message: z
          .object({
            role: z.enum(["user", "assistant", "system"]).describe("Message role"),
            content: z.string().describe("Message content"),
          })
          .optional()
          .describe("Message to append (required for 'append' action)"),
        token_budget: z
          .number()
          .int()
          .min(1)
          .default(4096)
          .describe("Token budget for context_window"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = { session_id: args.session_id };

      switch (args.action) {
        case "create": {
          const res = await client.execute("ai", "create_session", params);
          if (!res.ok || res.error) return formatError(res.error ?? "Create session failed");
          return formatResult({ session_id: args.session_id, message: "Session created" });
        }
        case "get_history": {
          const res = await client.execute("ai", "get_history", params);
          if (!res.ok || res.error) return formatError(res.error ?? "Get history failed");
          return formatResult({ session_id: args.session_id, messages: res.data });
        }
        case "append": {
          if (!args.message) return formatError("'message' is required for append action");
          params.message = args.message;
          const res = await client.execute("ai", "append_message", params);
          if (!res.ok || res.error) return formatError(res.error ?? "Append message failed");
          return formatResult({ session_id: args.session_id, message: "Message appended" });
        }
        case "context_window": {
          params.token_budget = args.token_budget;
          const res = await client.execute("ai", "get_context_window", params);
          if (!res.ok || res.error) return formatError(res.error ?? "Get context window failed");
          return formatResult({ session_id: args.session_id, context: res.data });
        }
      }
    }
  );

  server.registerTool(
    "talon_ai_memory",
    {
      title: "Talon AI Memory",
      description: `Manage AI memories in Talon — store and search semantic memories for a session.

Actions:
  - "store": Store a memory with embedding
  - "search": Search memories by semantic similarity

Args:
  - action (string): "store" or "search"
  - session_id (string): Session identifier
  - content (string, optional): Memory text content (required for "store")
  - embedding (number[], optional): Embedding vector (required for both actions)
  - k (number, optional): Number of results for search (default: 5)

Returns: Varies by action`,
      inputSchema: {
        action: z.enum(["store", "search"]).describe("Memory action"),
        session_id: z.string().min(1).describe("Session identifier"),
        content: z.string().optional().describe("Memory text content (for 'store')"),
        embedding: z.array(z.number()).optional().describe("Embedding vector"),
        k: z.number().int().min(1).max(100).default(5).describe("Results for search"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const params: Record<string, unknown> = { session_id: args.session_id };

      if (args.action === "store") {
        if (!args.content) return formatError("'content' is required for store action");
        params.content = args.content;
        if (args.embedding) params.embedding = args.embedding;
        const res = await client.execute("ai", "store_memory", params);
        if (!res.ok || res.error) return formatError(res.error ?? "Store memory failed");
        return formatResult({ session_id: args.session_id, message: "Memory stored" });
      }

      if (!args.embedding) return formatError("'embedding' is required for search action");
      params.embedding = args.embedding;
      params.k = args.k;
      const res = await client.execute("ai", "search_memories", params);
      if (!res.ok || res.error) return formatError(res.error ?? "Search memories failed");
      return formatResult({ session_id: args.session_id, memories: res.data });
    }
  );
}
