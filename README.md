# Talon MCP Server

MCP (Model Context Protocol) server for the **Talon** multi-model data engine. Enables AI agents in Cursor, Claude Desktop, and other MCP-compatible clients to directly query and operate all 9 Talon engines.

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

**Total: 35+ tools** covering all Talon capabilities.

## Quick Start

### 1. Build

```bash
cd talon-mcp
npm install
npm run build
```

### 2. Start Talon Server

```bash
./talon-server --http-port 8080 --data ./data
```

### 3. Configure in Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "talon": {
      "command": "node",
      "args": ["/Users/dark/WebstormProjects/talon-mcp/dist/index.js"],
      "env": {
        "TALON_URL": "http://localhost:8080"
      }
    }
  }
}
```

### 4. Configure in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "talon": {
      "command": "node",
      "args": ["/Users/dark/WebstormProjects/talon-mcp/dist/index.js"],
      "env": {
        "TALON_URL": "http://localhost:8080"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TALON_URL` | `http://localhost:8080` | Talon server HTTP endpoint |
| `TALON_TIMEOUT` | `30000` | Request timeout in milliseconds |

## Examples

Once configured, AI agents can interact with Talon directly:

```
"Show me all tables in the database"
→ calls talon_list_tables

"Create a users table with id, name, and a 384-dim embedding column"
→ calls talon_sql_execute with CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, emb VECTOR(384))

"Search for vectors similar to [0.1, 0.2, ...] in the embeddings index"
→ calls talon_vector_search

"Set cache key session:abc to token123 with 1 hour TTL"
→ calls talon_kv_set with ttl=3600

"Find articles about 'machine learning' using hybrid search"
→ calls talon_fts_hybrid_search combining BM25 + vector similarity
```

## Development

```bash
npm run dev    # Watch mode with tsx
npm run build  # Production build
npm start      # Run built server
```

## License

MIT
