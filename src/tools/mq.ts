import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTalonClient, formatError, formatResult } from "../client.js";

export function registerMqTools(server: McpServer): void {
  const client = getTalonClient();

  server.registerTool(
    "talon_mq_publish",
    {
      title: "Talon MQ Publish",
      description: `Publish a message to a Talon message queue topic.

Supports optional key routing, delayed delivery, TTL, and priority.

Args:
  - topic (string): Topic name
  - payload (string): Message payload (typically JSON string)
  - key (string, optional): Routing key for partitioning
  - delay_ms (number, optional): Delay delivery in milliseconds
  - ttl_ms (number, optional): Message time-to-live in milliseconds
  - priority (number, optional): Priority 0-255 (higher = more urgent)

Returns: { topic: string, message_id: number }`,
      inputSchema: {
        topic: z.string().min(1).describe("Topic name"),
        payload: z.string().describe("Message payload (JSON string recommended)"),
        key: z.string().optional().describe("Routing key"),
        delay_ms: z.number().int().min(0).optional().describe("Delay delivery in ms"),
        ttl_ms: z.number().int().min(0).optional().describe("Message TTL in ms"),
        priority: z.number().int().min(0).max(255).optional().describe("Priority (0-255)"),
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
        topic: args.topic,
        payload: args.payload,
      };
      if (args.key) params.key = args.key;
      if (args.delay_ms !== undefined) params.delay_ms = args.delay_ms;
      if (args.ttl_ms !== undefined) params.ttl_ms = args.ttl_ms;
      if (args.priority !== undefined) params.priority = args.priority;

      const res = await client.execute("mq", "publish", params);
      if (!res.ok || res.error) return formatError(res.error ?? "MQ publish failed");

      return formatResult({ topic: args.topic, message_id: res.data });
    }
  );

  server.registerTool(
    "talon_mq_poll",
    {
      title: "Talon MQ Poll",
      description: `Poll messages from a Talon message queue topic using consumer group pattern.

Args:
  - topic (string): Topic name
  - group (string): Consumer group name
  - consumer (string): Consumer ID within the group
  - count (number, optional): Maximum messages to poll (default: 10)
  - block_ms (number, optional): Block wait time in ms (0 = non-blocking, default: 0)

Returns: { topic: string, messages: Array<{ id: number, payload: string, timestamp: number }>, count: number }`,
      inputSchema: {
        topic: z.string().min(1).describe("Topic name"),
        group: z.string().min(1).describe("Consumer group name"),
        consumer: z.string().min(1).describe("Consumer ID"),
        count: z.number().int().min(1).max(1000).default(10).describe("Max messages to poll"),
        block_ms: z.number().int().min(0).default(0).describe("Block wait time in ms (0 = non-blocking)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("mq", "poll", {
        topic: args.topic,
        group: args.group,
        consumer: args.consumer,
        count: args.count,
        block_ms: args.block_ms,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "MQ poll failed");

      const messages = Array.isArray(res.data) ? res.data : [];
      return formatResult({ topic: args.topic, messages, count: messages.length });
    }
  );

  server.registerTool(
    "talon_mq_ack",
    {
      title: "Talon MQ Acknowledge",
      description: `Acknowledge (confirm processing of) a message in Talon MQ.

Args:
  - topic (string): Topic name
  - group (string): Consumer group name
  - consumer (string): Consumer ID
  - message_id (number): Message ID to acknowledge

Returns: { topic: string, message_id: number, acknowledged: boolean }`,
      inputSchema: {
        topic: z.string().min(1).describe("Topic name"),
        group: z.string().min(1).describe("Consumer group name"),
        consumer: z.string().min(1).describe("Consumer ID"),
        message_id: z.number().int().describe("Message ID to ack"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("mq", "ack", {
        topic: args.topic,
        group: args.group,
        consumer: args.consumer,
        message_id: args.message_id,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "MQ ack failed");

      return formatResult({ topic: args.topic, message_id: args.message_id, acknowledged: true });
    }
  );

  server.registerTool(
    "talon_mq_create_topic",
    {
      title: "Talon MQ Create Topic",
      description: `Create a new message queue topic in Talon.

Args:
  - topic (string): Topic name
  - max_len (number, optional): Maximum topic length (0 = unlimited, default: 0)

Returns: { topic: string, message: string }`,
      inputSchema: {
        topic: z.string().min(1).describe("Topic name to create"),
        max_len: z.number().int().min(0).default(0).describe("Max topic length (0 = unlimited)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const res = await client.execute("mq", "create_topic", {
        topic: args.topic,
        max_len: args.max_len,
      });
      if (!res.ok || res.error) return formatError(res.error ?? "Create topic failed");

      return formatResult({ topic: args.topic, message: "Topic created" });
    }
  );

  server.registerTool(
    "talon_mq_list_topics",
    {
      title: "Talon MQ List Topics",
      description: `List all message queue topics in Talon.

Returns: { topics: string[] }`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const res = await client.execute("mq", "list_topics", {});
      if (!res.ok || res.error) return formatError(res.error ?? "List topics failed");

      return formatResult({ topics: res.data });
    }
  );
}
