# Talon MCP Server

[![npm version](https://img.shields.io/npm/v/talon-mcp-server.svg)](https://www.npmjs.com/package/talon-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) | 中文

面向 **Talon** 多模融合数据引擎的 MCP (Model Context Protocol) 服务器。让 Cursor、Claude Desktop、Windsurf 等 AI 编程工具中的 AI 助手可以直接查询和操作 Talon 全部 9 大引擎。

## 安装

```bash
npm install -g talon-mcp-server
```

或通过 `npx` 免安装直接使用：

```bash
npx talon-mcp-server
```

## 快速开始

### 1. 启动 Talon 数据库

```bash
./talon-server --http-port 8080 --data ./data
```

### 2. 在 Cursor 中配置

在项目的 `.cursor/mcp.json` 中添加：

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

### 3. 在 Claude Desktop 中配置

在 `~/Library/Application Support/Claude/claude_desktop_config.json` 中添加：

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

### 4. 在 Windsurf 中配置

在 `~/.codeium/windsurf/mcp_config.json` 中添加：

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

## 支持的引擎与工具

| 引擎 | 工具 | 说明 |
|------|------|------|
| **SQL** | `talon_sql_query`, `talon_sql_execute` | 完整 SQL，支持向量/地理函数 |
| **KV** | `talon_kv_get/set/delete/scan/mget/incr` | Redis 兼容的键值存储 |
| **Vector** | `talon_vector_search/insert/create_index` | HNSW 向量相似搜索 |
| **TimeSeries** | `talon_ts_query/write/create` | 时序数据，支持聚合降采样 |
| **MessageQueue** | `talon_mq_publish/poll/ack/create_topic/list_topics` | 消费者组、死信队列、优先级 |
| **FTS** | `talon_fts_search/index_doc/hybrid_search/create_index` | BM25 全文检索 + 混合搜索 (BM25+向量 RRF) |
| **GEO** | `talon_geo_search/add/create` | 地理空间半径/矩形搜索 |
| **Graph** | `talon_graph_query/shortest_path/add_vertex/add_edge/create` | 属性图，BFS 遍历、最短路径 |
| **AI** | `talon_ai_session`, `talon_ai_memory` | 会话/上下文/记忆管理 |
| **Admin** | `talon_list_tables/describe_table/server_info/persist/raw_execute` | 表结构查看、服务器状态、原始命令 |

共 **38 个工具**，覆盖 Talon 全部能力。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TALON_URL` | `http://localhost:8080` | Talon 服务器 HTTP 地址 |
| `TALON_TIMEOUT` | `30000` | 请求超时时间（毫秒） |

## 使用示例

配置完成后，AI 助手可以直接操作 Talon 数据库：

```
"列出数据库中所有的表"
→ talon_list_tables

"创建一个用户表，包含 id、name 和 384 维的 embedding 列"
→ talon_sql_execute: CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, emb VECTOR(384))

"在 embeddings 索引中搜索与 [0.1, 0.2, ...] 相似的向量"
→ talon_vector_search

"设置缓存键 session:abc 值为 token123，1 小时过期"
→ talon_kv_set(key="session:abc", value="token123", ttl=3600)

"用混合搜索查找关于'机器学习'的文章"
→ talon_fts_hybrid_search: BM25 + 向量相似度 RRF 融合
```

## 本地开发

```bash
git clone https://github.com/darkmice/talon-mcp.git
cd talon-mcp
npm install
npm run build

npm run dev    # 监听模式，自动重载
npm start      # 运行编译后的服务器
```

## 许可证

MIT
