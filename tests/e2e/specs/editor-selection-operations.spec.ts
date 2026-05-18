import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

async function setSelection(page: import('@playwright/test').Page, anchor: number, head?: number) {
  await page.evaluate((opts) => {
    const view = (window as any).__cmView
    if (view) {
      view.dispatch({ selection: { anchor: opts.anchor, head: opts.head ?? opts.anchor } })
    }
  }, { anchor, head })
  await page.waitForTimeout(100)
}

async function getSelectionRange(page: import('@playwright/test').Page): Promise<{ from: number; to: number; empty: boolean }> {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    if (!view) return { from: -1, to: -1, empty: true }
    const range = view.state.selection.main
    return { from: range.from, to: range.to, empty: range.empty }
  })
}

test.describe('Selection + Delete Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should delete multi-line selection and undo restores content', async ({ page }) => {
    await setContent(page, 'Line 1\nLine 2\nLine 3\nLine 4')
    await focusEditor(page)

    // Select "Line 2\nLine 3" (the middle two lines)
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        const text = view.state.doc.toString()
        const from = text.indexOf('Line 2')
        const to = text.indexOf('\nLine 4')
        if (from >= 0 && to >= 0) {
          view.dispatch({ selection: { anchor: from, head: to } })
        }
      }
    })
    await page.waitForTimeout(100)

    const selBefore = await getSelectionRange(page)
    expect(selBefore.empty).toBe(false)

    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).not.toContain('Line 2')
    expect(content).not.toContain('Line 3')
    expect(content).toContain('Line 1')
    expect(content).toContain('Line 4')

    // Undo restores
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('Line 1\nLine 2\nLine 3\nLine 4')
  })

  test('should delete entire document with select-all', async ({ page }) => {
    await setContent(page, 'Hello World\nSecond line')
    await focusEditor(page)

    await page.keyboard.press('Control+a')
    await page.waitForTimeout(100)

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(false)

    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('')

    // Undo restores
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('Hello World\nSecond line')
  })

  test('should replace selection with typed text', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select "World"
    await setSelection(page, 6, 11)
    await page.keyboard.type('Universe')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Hello Universe')
  })

  test('should handle selection across markdown boundaries', async ({ page }) => {
    await setContent(page, '# Title\n\nParagraph text')
    await focusEditor(page)

    // Select from "Title" to "Paragraph"
    await setSelection(page, 2, 15)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).not.toContain('Title')
    expect(content).not.toContain('Paragraph')
  })
})

test.describe('Selection + Format Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should format entire multi-line selection as bold', async ({ page }) => {
    await setContent(page, 'Line one\nLine two\nLine three')
    await focusEditor(page)

    // Select all via keyboard
    await page.keyboard.press('Control+a')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    // Multi-line bold wraps the entire selection
    expect(content).toContain('**')
    expect(content).toContain('Line one')
    expect(content).toContain('Line two')
    expect(content).toContain('Line three')
  })

  test('should format partial line and preserve remaining text', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select "Hello"
    await setSelection(page, 0, 5)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('**Hello** World')
  })

  test('should apply strikethrough to selection then undo', async ({ page }) => {
    await setContent(page, 'Delete me later')
    await focusEditor(page)

    await setSelection(page, 0, 15)
    await page.keyboard.press('Control+Shift+s')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('~~Delete me later~~')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('Delete me later')
  })
})

test.describe('Selection + Enter/Backspace Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should split line when pressing Enter with mid-line selection', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select " World"
    await setSelection(page, 5, 11)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('Hello')
    expect(content).toContain('\n')
  })

  test('should delete list marker when backspacing at start of list item', async ({ page }) => {
    await setContent(page, '- Item 1\n- Item 2')
    await focusEditor(page)

    // Position cursor right after "- " on second line
    await setSelection(page, 10, 10)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).not.toContain('- Item 2')
    expect(content).toContain('Item 2')
  })

  test('should merge lines when deleting newline', async ({ page }) => {
    await setContent(page, 'First\nSecond')
    await focusEditor(page)

    // Position cursor at end of first line
    await setSelection(page, 5, 5)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toBe('FirstSecond')
  })

  test('should preserve structure when deleting within nested blocks', async ({ page }) => {
    await setContent(page, '> Quote line 1\n> Quote line 2\n> Quote line 3')
    await focusEditor(page)

    // Select middle line
    await setSelection(page, 15, 29)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('Quote line 1')
    expect(content).toContain('Quote line 3')
    expect(content).not.toContain('Quote line 2')
  })
})

test.describe('Selection State After Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should have empty selection after typing replaces selection', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    await setSelection(page, 0, 5)
    await page.keyboard.type('Hi')
    await page.waitForTimeout(200)

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(2)
  })

  test('should collapse selection after backspace', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    await setSelection(page, 0, 5)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
  })

  test('should maintain selection direction after formatting', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select backward
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 5, head: 0 } })
    })
    await page.waitForTimeout(100)

    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    const sel = await getSelectionRange(page)
    // After formatting, selection should wrap the bolded text (not empty)
    expect(sel.empty).toBe(false)
    // Selection covers "Hello" (5 chars) inside "**Hello**"
    expect(sel.to - sel.from).toBe(5)
  })
})
