# 编辑器发布前检查单

## 自动化回归（必须全部通过）

```bash
# 前端单元测试
cd frontend && pnpm vitest run

# 编辑器专项 e2e（三件套）
cd tests/e2e && pnpm test -- specs/editor-selection-stability.spec.ts specs/editor-widget-selection.spec.ts specs/editor-long-document.spec.ts

# 编辑器大改后必须运行完整 e2e
cd tests/e2e && pnpm test
```

## 手动测试清单

### 中文输入法

- [ ] macOS 中文拼音：连续输入、选词、回车、删除。
- [ ] 中英文混排：加粗、斜体、链接。

### 粘贴与内容

- [ ] 粘贴大段 Markdown。
- [ ] 从外部复制图片 Markdown。

### 文件与模式

- [ ] 快速切换文件时编辑器内容、dirty 状态、光标不串文档。
- [ ] raw/rich mode 反复切换后内容与光标可预测。

### 查找面板

- [ ] 查找面板打开时输入、关闭、继续编辑无异常。

## 回归标准

任何触碰以下类型的改动都必须满足：

- 没有新增直接依赖 `@codemirror/*` 的业务文件（adapter/extension 除外）。
- 没有新增散落的 `view.dispatch`。
- 没有新增散落的 `coordsAtPos`、`posAtCoords`（统一走 `geometry.ts`）。
- 新增 widget 必须有 destroy cleanup。
- 新增编辑命令必须有 selection 断言。
- E2E helper 不依赖私有实现细节，优先使用 `window.__editor`。
