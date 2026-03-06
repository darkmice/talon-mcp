# Talon MCP Server

[![npm version](https://img.shields.io/npm/v/talon-mcp-server.svg)](https://www.npmjs.com/package/talon-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [中文](README_zh.md)

MCP (Model Context Protocol) server for the **Talon** multi-model data engine. Enables AI agents in Cursor, Claude Desktop, Windsurf, and other MCP-compatible clients to directly query and operate all 9 Talon engines.

## Install

```bash
npm install -g talon-mcp-server
```

Or use directly via `npx` — no install needed:

```bash
npx talon-mcp-server
```

## Quick Start

### 1. Start Talon Server

```bash
./talon-server --http-port 8080 --data ./data
```

### 2. Configure in Cursor

Add to your project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "talon": {
      "command": "npx",
      "args": ["-y", "talon-mcp-server"],
      "env": {
        "TALON_URL": "http://localhost:8080"
      }
    }
  }
}
```

### 3. Configure in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "talon": {
      "command": "npx",
      "args": ["-y", "talon-mcp-server"],
      "env": {
        "TALON_URL": "http://localhost:8080"
      }
    }
  }
}
```

### 4. Configure in Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "talon": {
      "command": "npx",
      "args": ["-y", "talon-mcp-server"],
      "env": {
        "TALON_URL": "http://localhost:8080"
      }
    }
  }
}
```

## Supported Engines & Tools

| Engine | Tools | Description |
|--------|-------|-------------|
| **SQL** | `talon_sql_query`, `talon_sql_execute` | Full SQL with vector/geo functions |
| **KV** | `talon_kv_get/set/delete/scan/mget/incr` | Redis-compatible key-value store |
| **Vector** | `talon_vector_search/insert/create_index` | HNSW similarity search |
| **TimeSeries** | `talon_ts_query/write/create` | Time-series data with aggregation |
| **MessageQueue** | `talon_mq_publish/poll/ack/create_topic/list_topics` | Consumer groups, DLQ, priority |
| **FTS** | `talon_fts_search/index_doc/hybrid_search/create_index` | BM25 + hybrid (BM25+Vector RRF) |
| **GEO** | `talon_geo_search/add/create` | Geospatial radius/box search |
| **Graph** | `talon_graph_query/shortest_path/add_vertex/add_edge/create` | Property graph with BFS, shortest path |
| **AI** | `talon_ai_session`, `talon_ai_memory` | Session/Context/Memory management |
| **Admin** | `talon_list_tables/describe_table/server_info/persist/raw_execute` | Schema inspection, server status, raw commands |

**38 tools** covering all Talon capabilities.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TALON_URL` | `http://localhost:8080` | Talon server HTTP endpoint |
| `TALON_TIMEOUT` | `30000` | Request timeout in milliseconds |

## Examples

Once configured, AI agents can interact with Talon directly:

```
"Show me all tables in the database"
→ talon_list_tables

"Create a users table with id, name, and a 384-dim embedding column"
→ talon_sql_execute: CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, emb VECTOR(384))

"Search for vectors similar to [0.1, 0.2, ...] in the embeddings index"
→ talon_vector_search

"Set cache key session:abc to token123 with 1 hour TTL"
→ talon_kv_set(key="session:abc", value="token123", ttl=3600)

"Find articles about 'machine learning' using hybrid search"
→ talon_fts_hybrid_search: BM25 + vector similarity with RRF fusion
```

## Development

```bash
git clone https://github.com/darkmice/talon-mcp.git
cd talon-mcp
npm install
npm run build

npm run dev    # Watch mode with tsx
npm start      # Run built server
```

## License

MIT
