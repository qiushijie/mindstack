# MindStack

[English](../README.md)

面向开发者的 Markdown 编辑器，支持 Git 仓库同步，供开发者或 AI 代码生成工具维护知识库使用。

## 功能特性

- Markdown 编辑与渲染
- Git 仓库同步
- AI 友好的 CLI

![示例](images/example.png)

查看 [example.md](example.md) 了解所有支持的节点类型。

## 快速开始

前往 [Releases](https://github.com/qiushijie/mindstack/releases) 页面，根据你的平台下载最新安装包。

## 开发

### 环境准备

- [Go](https://go.dev/dl/)
- [Node.js](https://nodejs.org/) 与 pnpm
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
cd frontend && pnpm install
```

### 开发模式

```bash
wails dev
```

### 构建

```bash
wails build
```

构建产物输出到 `build/bin/`。

### 测试

```bash
# Go 单元测试
go test ./...

# 前端单元测试 (vitest + happy-dom)
cd frontend && pnpm vitest run

# E2E 测试 (Playwright)
# 先确保 `wails dev` 已启动，然后执行:
cd tests/e2e && pnpm test
```

## 许可证

MIT
