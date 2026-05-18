import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor } from '../helpers/editor'

const MERMAID_FLOWCHART = `\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\``

const MERMAID_SEQUENCE = `\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
\`\`\``

async function moveCursorOutOfMermaid(page: import('@playwright/test').Page) {
  // Move cursor to the end of document to trigger preview mode
  await page.evaluate(() => {
    const view = (window as any).__cmView
    if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
  })
  await page.waitForTimeout(300)
}

test.describe('Mermaid Diagram Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render mermaid preview with cm-mermaid-preview class', async ({ page }) => {
    await setContent(page, MERMAID_FLOWCHART)
    await moveCursorOutOfMermaid(page)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()
  })

  test('should show mermaid badge in preview header', async ({ page }) => {
    await setContent(page, MERMAID_FLOWCHART)
    await moveCursorOutOfMermaid(page)

    const badge = page.locator('.cm-mermaid-preview .cm-mermaid-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('mermaid')
  })

  test('should show edit button in preview header', async ({ page }) => {
    await setContent(page, MERMAID_FLOWCHART)
    await moveCursorOutOfMermaid(page)

    const editBtn = page.locator('.cm-mermaid-preview .cm-mermaid-edit-btn')
    await expect(editBtn).toBeVisible()
  })

  test('should render SVG in preview area', async ({ page }) => {
    await setContent(page, MERMAID_FLOWCHART)
    await moveCursorOutOfMermaid(page)

    const previewArea = page.locator('.cm-mermaid-preview-area')
    await expect(previewArea).toBeVisible()

    // Wait for mermaid async render
    await page.waitForTimeout(1000)

    // Mermaid renders SVG
    const svg = previewArea.locator('svg')
    expect(await svg.count()).toBeGreaterThan(0)
  })

  test('should show separator between header and preview', async ({ page }) => {
    await setContent(page, MERMAID_FLOWCHART)
    await moveCursorOutOfMermaid(page)

    const sep = page.locator('.cm-mermaid-sep')
    await expect(sep).toBeVisible()
  })

  test('should switch to edit mode when cursor enters mermaid block', async ({ page }) => {
    await setContent(page, MERMAID_FLOWCHART)
    await moveCursorOutOfMermaid(page)

    // Preview visible initially
    await expect(page.locator('.cm-mermaid-preview')).toBeVisible()

    // Move cursor inside the block (position inside the mermaid content)
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 15 } })
    })
    await page.waitForTimeout(300)

    // Preview should disappear, edit mode classes should appear
    await expect(page.locator('.cm-mermaid-preview')).not.toBeVisible()
    await expect(page.locator('.cm-mermaid-edit-header')).toBeVisible()
    await expect(page.locator('.cm-line.cm-mermaid-block').first()).toBeVisible()
  })

  test('should render sequence diagram', async ({ page }) => {
    await setContent(page, MERMAID_SEQUENCE)
    await moveCursorOutOfMermaid(page)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    const previewArea = page.locator('.cm-mermaid-preview-area')
    await page.waitForTimeout(1000)
    expect(await previewArea.locator('svg').count()).toBeGreaterThan(0)
  })

  test('should handle invalid mermaid gracefully', async ({ page }) => {
    const invalidMermaid = `\`\`\`mermaid
invalid syntax here!!!
\`\`\``
    await setContent(page, invalidMermaid)
    await moveCursorOutOfMermaid(page)

    // Wait for async error render
    await page.waitForTimeout(1000)

    // Should show error message
    const error = page.locator('.cm-mermaid-error')
    await expect(error).toBeVisible()
  })

  test('should not render preview for non-mermaid code blocks', async ({ page }) => {
    await setContent(page, '```js\nconsole.log(1)\n```')
    await page.waitForTimeout(500)

    // Should not have mermaid preview
    const mermaidPreview = page.locator('.cm-mermaid-preview')
    expect(await mermaidPreview.count()).toBe(0)

    // Should have code header instead
    await expect(page.locator('.cm-code-header')).toBeVisible()
  })
})
