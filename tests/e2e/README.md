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

### Manual (recommended for debugging)

Start `wails dev` in one terminal:
```bash
wails dev
```

Run tests in another terminal:
```bash
cd tests/e2e
pnpm test
```

### Automated

Start `wails dev` and run tests in one command:
```bash
cd tests/e2e
node scripts/run-e2e.js
```

### Run a single test file

```bash
pnpm test specs/app-startup.spec.ts
```

### Headed mode

```bash
pnpm test:headed
```

### Playwright UI debugger

```bash
pnpm test:ui
```

### View report

```bash
pnpm report
```

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
- **Editor content**: Access via `window.__cmView` (exposed in DEV mode by `useEditorState.ts`)
- **Native dialogs**: File picker cannot be tested by Playwright; covered by Go unit tests instead
- **Selection toolbar**: Only triggers on mouse interaction (`pointerup`), not keyboard selection
