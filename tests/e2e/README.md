# MindStack E2E Tests

End-to-end tests for MindStack, using Playwright connected to a live `wails dev` server.

## Prerequisites

1. Install Wails CLI
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```

2. Install dependencies
   ```bash
   cd tests/e2e && pnpm install
   ```

3. Install Playwright browsers
   ```bash
   pnpm exec playwright install chromium
   ```

## Running Tests

### Automated (recommended)

Starts `wails dev` with an isolated config directory, runs tests, then cleans up:

```bash
cd tests/e2e
pnpm test
```

Use headed mode for debugging:

```bash
pnpm test:headed
```

### Run a single test file

```bash
pnpm test -- specs/app-startup.spec.ts
```

### Playwright UI debugger

```bash
pnpm test:ui
```

### Manual (advanced)

Start `wails dev` in one terminal:

```bash
cd tests/e2e
pnpm playwright test
```

**Note:** The automated runner (`pnpm test`) creates an isolated temporary config directory to prevent test data from affecting your normal application config. When running manually with `pnpm playwright test`, ensure `MINDSTACK_CONFIG_DIR` is set to avoid polluting the real config.

### View report

```bash
pnpm report
```

## Config Isolation

E2e tests are automatically isolated from your normal application config:

- The `run-e2e.js` script creates a temporary directory (e.g. `/tmp/mindstack-e2e-xxxx`) and sets `MINDSTACK_CONFIG_DIR` before launching `wails dev`
- The Go backend reads `MINDSTACK_CONFIG_DIR` in `config.ConfigPath()` and writes `config.json` to the temp directory instead of `~/.config/mindstack/config.json`
- The temp directory is cleaned up when tests finish
- The `bash run.sh` script and `pnpm test` / `pnpm test:headed` / `pnpm test:debug` / `pnpm test:ui` all use this isolated approach

If you start `wails dev` manually, config isolation is not applied — test changes will write to your real config file.

## Project Structure

- `helpers/` - Test utilities
  - `app.ts` - App-level operations (wait for load, page navigation)
  - `editor.ts` - CodeMirror operations (read/write content, formatting)
- `fixtures/` - Test data
  - `workspace/` - Markdown files for file operation tests
- `specs/` - Test suites organized by feature
- `scripts/` - Runner scripts

## Writing New Tests

```typescript
import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { typeInEditor, getContent } from '../helpers/editor'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should do something', async ({ page }) => {
    // test code
  })
})
```

## Notes

- **Page navigation**: Use `window.__navigateTo()` (exposed in DEV mode by `useNavigation.ts`)
- **Editor content**: Access via `window.__editor` (exposed in DEV mode by `useEditorState.ts`). The legacy `window.__cmView` is still available for older tests but should not be used in new tests.
- **Native dialogs**: File picker cannot be tested by Playwright; covered by Go unit tests instead
- **Selection toolbar**: Only triggers on mouse interaction (`pointerup`), not keyboard selection

## Editor Regression Specs

The following three spec files form the editor regression threshold and are run
by both the local regression script and CI:

- `specs/editor-selection-stability.spec.ts` — cursor/selection behavior across
  paragraphs, headings, lists, todos, clipboard, and long documents.
- `specs/editor-widget-selection.spec.ts` — entering and leaving edit mode for
  image, math, mermaid, and table widgets.
- `specs/editor-long-document.spec.ts` — scrolling, editing, drag-select, mode
  switching, and search in large documents.

Run them together with:

```bash
cd tests/e2e
pnpm test -- specs/editor-selection-stability.spec.ts specs/editor-widget-selection.spec.ts specs/editor-long-document.spec.ts
```

Or use the shortcut:

```bash
pnpm test:editor-regression
```

## Skipped Tests

Only mark a test as `test.fixme()` when a real product bug or an environment
limitation prevents it from passing. Include a comment explaining the blocker so
future contributors know what needs to be fixed.
