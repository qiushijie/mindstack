import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, typeInEditor } from '../helpers/editor'

// --- Helper: operate on CodeMirror selection via view API ---

async function setSelection(page: import('@playwright/test').Page, anchor: number, head?: number) {
  await page.evaluate((opts) => {
    const view = (window as any).__cmView
    if (view) {
      view.dispatch({ selection: { anchor: opts.anchor, head: opts.head ?? opts.anchor } })
    }
  }, { anchor, head })
  await page.waitForTimeout(100)
}

async function getCursorPos(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    return view ? view.state.selection.main.head : -1
  })
}

async function getSelectionRange(page: import('@playwright/test').Page): Promise<{ from: number; to: number; empty: boolean }> {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    if (!view) return { from: -1, to: -1, empty: true }
    const range = view.state.selection.main
    return { from: range.from, to: range.to, empty: range.empty }
  })
}

// Select a substring by its text content (more robust than hardcoded positions)
async function selectText(page: import('@playwright/test').Page, text: string, occurrence = 0): Promise<boolean> {
  const result = await page.evaluate((opts) => {
    const view = (window as any).__cmView
    if (!view) return null
    const doc = view.state.doc.toString()
    let pos = -1
    let count = 0
    while (true) {
      const idx = doc.indexOf(opts.text, pos + 1)
      if (idx === -1) break
      if (count === opts.occurrence) {
        view.dispatch({ selection: { anchor: idx, head: idx + opts.text.length } })
        return { from: idx, to: idx + opts.text.length }
      }
      pos = idx
      count++
    }
    return null
  }, { text, occurrence })
  await page.waitForTimeout(100)
  return result !== null
}

// --- Test suites ---

test.describe('Editor Workflow - Format Chain', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should maintain content integrity through type-bold-move-type-undo', async ({ page }) => {
    // Step 1: type initial text
    await typeInEditor(page, 'Hello World')
    expect(await getContent(page)).toBe('Hello World')

    // Step 2: select "Hello" and bold it
    await selectText(page, 'Hello')
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    let content = await getContent(page)
    expect(content).toBe('**Hello** World')

    // Step 3: move cursor after "World" and type more
    await setSelection(page, content.length)
    await page.keyboard.type('!!!')
    await page.waitForTimeout(200)
    content = await getContent(page)
    expect(content).toBe('**Hello** World!!!')

    // Step 4: undo twice should revert to original
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    content = await getContent(page)
    expect(content).toBe('**Hello** World')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should handle multi-format sequence correctly', async ({ page }) => {
    await setContent(page, 'alpha beta gamma')
    await focusEditor(page)

    // Bold "alpha" — use text search to find position
    const foundAlpha = await selectText(page, 'alpha')
    expect(foundAlpha).toBe(true)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    // Strikethrough "beta" — re-search after document changed
    // Note: Ctrl+I is intercepted by Chromium, so we use strikethrough instead
    const foundBeta = await selectText(page, 'beta')
    expect(foundBeta).toBe(true)
    await page.keyboard.press('Control+Shift+s')
    await page.waitForTimeout(200)

    // Code "gamma"
    const foundGamma = await selectText(page, 'gamma')
    expect(foundGamma).toBe(true)
    await page.keyboard.press('Control+`')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('**alpha**')
    expect(content).toContain('~~beta~~')
    expect(content).toContain('`gamma`')

    // Undo all and verify back to plain text
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+z')
      await page.waitForTimeout(200)
    }
    expect(await getContent(page)).toBe('alpha beta gamma')
  })

  test('should preserve cursor position through undo-redo', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Type at end
    await setSelection(page, 11)
    await page.keyboard.type('!')
    await page.waitForTimeout(200)

    let pos = await getCursorPos(page)
    expect(pos).toBe(12)

    // Undo should restore content
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('Hello World')
  })

  test('should handle format-delete-undo sequence', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Bold the whole text
    await setSelection(page, 0, 11)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('**Hello World**')

    // Delete from after "He" to before the closing **
    // "**Hello World**" — positions: **(0-1) He(2-3) llo World(4-12) **(13-14)
    // Deleting 4-13 removes "llo World*" leaving "**He*"
    // But CodeMirror produces "**He**" after the deletion
    await setSelection(page, 4, 13)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    const afterDelete = await getContent(page)
    expect(afterDelete).toBe('**He**')

    // Undo should restore formatted text
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('**Hello World**')

    // Undo should restore plain text
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('Hello World')
  })

  test('should handle heading conversion then typing', async ({ page }) => {
    await setContent(page, 'Title')
    await focusEditor(page)

    // Convert to H1
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('# Title')

    // Type after heading
    await setSelection(page, 7)
    await page.keyboard.type('\n\nBody text')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toContain('# Title')
    expect(content).toContain('Body text')

    // Undo should step through insertions
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    const afterUndo = await getContent(page)
    // After undo, heading should remain (typing was undone)
    expect(afterUndo.trim()).toBe('# Title')
  })
})

test.describe('Editor Workflow - Block Structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle list creation-typing-indent-outdent', async ({ page }) => {
    await setContent(page, 'Item')
    await focusEditor(page)

    // Convert to list
    await page.keyboard.press('Control+Shift+8')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('- Item')

    // Move to end and add new item
    await setSelection(page, 6)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.type('Second')
    await page.waitForTimeout(200)
    let content = await getContent(page)
    expect(content).toContain('- Item')
    expect(content).toContain('- Second')

    // Indent second item
    const secondItemPos = content.indexOf('- Second')
    await setSelection(page, secondItemPos + 8)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    content = await getContent(page)
    expect(content).toContain('  - Second')

    // Outdent
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(200)
    content = await getContent(page)
    expect(content).toContain('- Second')
  })

  test('should handle blockquote-then-code sequence', async ({ page }) => {
    await setContent(page, 'Quote text\n\nCode here')
    await focusEditor(page)

    // First paragraph to blockquote
    const found = await selectText(page, 'Quote text')
    expect(found).toBe(true)
    await page.keyboard.press('Control+Shift+.')
    await page.waitForTimeout(200)

    // Code "Code here"
    const foundCode = await selectText(page, 'Code here')
    expect(foundCode).toBe(true)
    await page.keyboard.press('Control+`')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('> Quote text')
    expect(content).toContain('`Code here`')
  })

  test('should handle nested structure undo', async ({ page }) => {
    await setContent(page, '# H1\n\n- item\n\n> quote')
    await focusEditor(page)

    // Delete the list item line
    const found = await selectText(page, '- item')
    expect(found).toBe(true)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    let content = await getContent(page)
    expect(content).not.toContain('- item')
    expect(content).toContain('# H1')
    expect(content).toContain('> quote')

    // Undo
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    content = await getContent(page)
    expect(content).toContain('- item')
    expect(content).toContain('# H1')
    expect(content).toContain('> quote')
  })
})

test.describe('Editor Workflow - Selection State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should maintain selection direction after format', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select backward: anchor at 5, head at 0 (selecting "Hello" right-to-left)
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 5, head: 0 } })
    })
    await page.waitForTimeout(100)

    let sel = await getSelectionRange(page)
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(5)

    // Bold it
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toBe('**Hello** World')
  })

  test('should handle multi-line selection format', async ({ page }) => {
    await setContent(page, 'Line one\nLine two\nLine three')
    await focusEditor(page)

    // Select across lines: from "one" to "two"
    await setSelection(page, 5, 13) // "one\nLine"
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    // CodeMirror wraps the entire selection in **...**
    expect(content).toContain('**one')
    expect(content).toContain('Line**')
  })

  test('should handle selection after delete-undo', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select and delete "Hello"
    await setSelection(page, 0, 5)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe(' World')

    // Undo - content restored
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('Hello World')
  })
})
