---
name: mindstack
description: MindStack CLI 工具使用，用于 AI codegen 工具操作 markdown 知识库，包括文档搜索、元数据管理、关联分析和 LLM 同步
---

# MindStack CLI 使用指南

## 触发条件

当用户需要操作知识库时触发此 skill：

- 搜索文档内容或标签
- 查看文档元数据（标题、摘要、标签、状态）
- 查看文档关联关系
- 同步工作区（LLM 生成元数据和关联）
- 查看知识库概览
- 编辑 markdown 文档

关键词：`知识库` `mindstack` `文档管理` `文档搜索` `文档关联` `知识库同步` `kb` `markdown管理`

## 前置条件

使用命令前，当前工作目录（或其父目录）必须存在 `.mindstack/config.yaml`。关联多个知识库时需要通过 `--kb <name>` 指定目标：

```bash
mindstack --kb kb1 ls
mindstack --kb kb2 meta /path/to/kb2/docs/example.md
```

仅关联单个知识库时 `--kb` 可省略。

`sync` 命令需要 LLM 服务可用，否则报 `LLM_UNAVAILABLE` 错误（exit code 3）。

## 输出格式

所有命令向 **stdout** 输出 JSON，向 **stderr** 输出错误。

错误格式：
```json
{"error": "错误描述", "code": "ERROR_CODE"}
```

Exit code：0 成功，1 用户错误，2 未初始化，3 LLM 不可用。

`sync` 命令在 stderr 逐行输出进度（JSON），最终结果仍在 stdout。

## 文件读写

**CLI 不提供 read、write 和 edit 命令。** 所有返回的文档路径都是绝对路径，直接使用 Read/Write/Edit 工具操作这些路径：

- 读取文档：对 `ls`、`search`、`meta`、`relation` 等命令返回的绝对路径调用 Read 工具
- 写入文档：对要创建/覆盖的绝对路径调用 Write 工具
- 编辑文档：对绝对路径调用 Edit 工具

## 命令参考

### 文档浏览

#### `mindstack info`

显示知识库概览。

```bash
mindstack info
```

成功输出：
```json
{
  "root": "/path/to/kb",
  "name": "my-kb",
  "version": "1",
  "documentCount": 42,
  "relationCount": 15,
  "knowledgeBases": [{"name": "linked-kb", "path": "/path/to/linked"}]
}
```

`documentCount` 统计的是有元数据的文档数，不一定等于文件系统中所有 markdown 文件数。

#### `mindstack ls [path]`

列出 markdown 文件（`.md` / `.markdown`）和目录。目录优先，按名称字母排序。不包含隐藏目录和 `.mindstack/`。

```bash
mindstack ls
mindstack ls docs/
```

成功输出：
```json
{
  "root": "/path/to/kb",
  "prefix": "docs/",
  "documents": [
    {"path": "/path/to/kb/docs/api/", "name": "api", "isDir": true},
    {"path": "/path/to/kb/docs/api/auth.md", "name": "auth.md", "isDir": false}
  ],
  "total": 2
}
```

### 搜索

#### `mindstack search <query>`

默认标签搜索（多个标签用逗号分隔实现 AND 过滤），可通过 `--fulltext` 切换为全文搜索。

```bash
# 标签搜索（默认，大小写不敏感）
mindstack search "tutorial"

# 多标签搜索（AND：文档必须同时包含所有指定标签）
mindstack search "api,rest"

# 全文搜索（大小写不敏感，子串匹配）
mindstack search "keyword" --fulltext
```

标签搜索输出：
```json
{
  "query": "tutorial",
  "mode": "tag",
  "results": [
    {"path": "/path/to/kb/docs/guide.md", "title": "教程", "summary": "指南摘要"}
  ],
  "total": 1
}
```

全文搜索输出：
```json
{
  "query": "keyword",
  "mode": "fulltext",
  "results": [
    {"path": "/path/to/kb/docs/example.md", "title": "示例", "matchCount": 3}
  ],
  "total": 1
}
```

错误码：`SEARCH_FAILED`、`SCAN_FAILED`。

### 元数据

#### `mindstack meta <path>`

查看文档元数据。路径为**绝对路径**（如 `ls`、`search` 返回的 `path`），文件必须存在。元数据由 `sync` 通过 LLM 生成。

```bash
mindstack meta /path/to/kb/docs/example.md
```

有元数据时：
```json
{
  "path": "/path/to/kb/docs/example.md",
  "found": true,
  "title": "示例文档",
  "summary": "文档摘要",
  "tags": ["tutorial", "getting-started"],
  "status": "active",
  "contentHash": "abc123..."
}
```

无元数据时：
```json
{
  "path": "/path/to/kb/docs/example.md",
  "found": false
}
```

无元数据时 exit 0，`found: false` 表示尚未被 sync 处理。

#### `mindstack tags`

列出所有标签及其文档数量，按数量降序排列。

```bash
mindstack tags
```

成功输出：
```json
{
  "tags": [
    {"name": "tutorial", "count": 5},
    {"name": "api", "count": 3}
  ],
  "totalTags": 10,
  "totalDocuments": 42
}
```

### 文档关联

#### `mindstack relation <path>`

查看指定文档的入向和出向关联。路径为**绝对路径**（如 `ls`、`search` 返回的 `path`），文件必须存在。

```bash
mindstack relation /path/to/kb/docs/example.md
```

成功输出：
```json
{
  "path": "/path/to/kb/docs/example.md",
  "outgoing": [
    {"source": "/path/to/kb/docs/example.md", "target": "/path/to/kb/docs/other.md", "score": 0.75, "reason": "...", "sharedTags": ["api"]}
  ],
  "incoming": [
    {"source": "/path/to/kb/docs/ref.md", "target": "/path/to/kb/docs/example.md", "score": 0.8, "reason": "...", "sharedTags": ["tutorial"]}
  ],
  "totalOutgoing": 1,
  "totalIncoming": 1
}
```

### 同步

#### `mindstack sync`

使用 LLM 生成文档元数据和关联关系。分两阶段：

1. **Meta 阶段**：扫描 markdown 文件，对内容变化的文档生成 title/summary/tags。新文档默认 status 为 "active"。自动清理已删除文件的元数据。
2. **Relation 阶段**：对变更文档，找到共享标签的候选文档，LLM 评分关联。

进度输出到 stderr：

```json
{"file":"docs/a.md","current":1,"total":10,"status":"processing","phase":"meta"}
{"file":"docs/a.md","current":1,"total":10,"status":"done","phase":"meta","summary":"..."}
{"status":"complete","current":10,"total":10}
```

成功输出：
```json
{
  "root": "/path/to/kb",
  "status": "complete",
  "filesProcessed": 8,
  "filesSkipped": 2,
  "errors": ["docs/broken.md: read error"]
}
```

错误码：`LLM_UNAVAILABLE`（exit 3）、`SYNC_FAILED`（exit 1）。

## 常见工作流

### 浏览和读取

```bash
mindstack ls                                        # 列出文档结构，获取绝对路径
# 对返回的路径直接调用 Read 工具读取内容
mindstack meta /path/to/kb/docs/interesting.md      # 查看元数据（输入绝对路径）
mindstack relation /path/to/kb/docs/interesting.md  # 查看关联（输入绝对路径）
```

### 搜索和探索

```bash
mindstack search "api"                              # 标签搜索，返回匹配文档的绝对路径
mindstack search "api,rest"                         # 多标签 AND 搜索
mindstack search "keyword" --fulltext               # 全文搜索
# 对搜索结果中的路径调用 Read 工具读取内容
mindstack relation /path/to/kb/docs/api/auth.md     # 探索关联文档（输入绝对路径）
```

### 创建和编辑

创建/编辑文档：直接对绝对路径使用 Write/Edit 工具。

### 同步后检查

```bash
mindstack sync       # 同步
mindstack tags       # 查看标签分布
```

## 错误处理

| 错误码 | 原因 | 处理 |
|--------|------|------|
| `NOT_INITIALIZED` (exit 2) | 未找到 `.mindstack/` | 提示用户执行 `init` 或 `link` |
| `NOT_FOUND` | 文件路径不正确 | 用 `ls` 确认文件存在 |
| `KB_AMBIGUOUS` | 多知识库未指定目标 | 添加 `--kb <name>` |
| `KB_NOT_FOUND` | `--kb` 名称不存在 | 用 `info` 查看可用知识库列表 |
| `LLM_UNAVAILABLE` (exit 3) | LLM 未配置 | 提示用户配置 LLM 服务 |

## 注意事项

- **路径**：所有命令返回的文档路径均为绝对路径，可直接用于 Read/Write/Edit 工具
- **输入路径**：`meta`、`relation` 等命令的输入路径为绝对路径（直接传入 `ls` / `search` 返回的 `path`）
- **`--kb` 位置**：必须在子命令之前 `mindstack --kb name ls`，不能放在后面
- **`meta` found: false**：exit 0 不是错误，表示文档尚未 sync，可执行 `sync` 生成
- **sync 幂等**：sync 自动跳过未修改的文档，可安全重复执行
- **sync 截断**：超长文档可能被截断发给 LLM，影响摘要质量
