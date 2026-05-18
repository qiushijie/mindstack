import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, typeInEditor } from '../helpers/editor'

test.describe('Editor Extreme - Undo/Redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should undo typed text', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.waitForTimeout(200)

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toBe('')
  })

  test('should undo and redo multiple times', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('Hello')
    await page.waitForTimeout(200)

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    let content = await getContent(page)
    expect(content).toBe('')

    // Try both common redo shortcuts
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(200)

    content = await getContent(page)
    if (content !== 'Hello') {
      await page.keyboard.press('Control+y')
      await page.waitForTimeout(200)
      content = await getContent(page)
    }
    expect(content).toBe('Hello')
  })

  test('should undo formatting change', async ({ page }) => {
    await setContent(page, 'Hello')
    await focusEditor(page)
    await page.keyboard.press('Control+a')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)

    let content = await getContent(page)
    expect(content).toContain('**Hello**')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    content = await getContent(page)
    expect(content).toBe('Hello')
  })
})

test.describe('Editor Extreme - Empty & Whitespace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle empty document', async ({ page }) => {
    const content = await getContent(page)
    expect(content).toBe('')

    await expect(page.locator('.cm-content')).toBeVisible()
    await expect(page.locator('.cm-line')).toHaveCount(1)
  })

  test('should handle document with only newlines', async ({ page }) => {
    await setContent(page, '\n\n\n')
    const content = await getContent(page)
    expect(content).toBe('\n\n\n')

    const lines = page.locator('.cm-line')
    expect(await lines.count()).toBeGreaterThanOrEqual(1)
  })

  test('should handle document with only spaces', async ({ page }) => {
    await setContent(page, '   ')
    const content = await getContent(page)
    expect(content).toBe('   ')
  })

  test('should handle very long single line', async ({ page }) => {
    const longLine = 'a'.repeat(5000)
    await setContent(page, longLine)
    const content = await getContent(page)
    expect(content).toBe(longLine)

    // Editor should still be visible and functional
    await expect(page.locator('.cm-content')).toBeVisible()
  })
})

test.describe('Editor Extreme - Special Characters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle Chinese characters', async ({ page }) => {
    const text = '中文测试内容，包含标点符号。'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle emoji characters', async ({ page }) => {
    const text = 'Hello \u{1F30D} World \u{1F680}'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle mixed CJK and markdown syntax', async ({ page }) => {
    const text = '# 标题\n\n**加粗中文**和*斜体*\n\n- 列表项一\n- 列表项二'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle zero-width characters', async ({ page }) => {
    const text = 'test​text‌more'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle special markdown chars as plain text', async ({ page }) => {
    const text = 'Use * for multiplication and _ for underline'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })
})

test.describe('Editor Extreme - Nested Blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle list inside blockquote', async ({ page }) => {
    const text = '> - item 1\n> - item 2\n> > nested quote'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle code block inside list', async ({ page }) => {
    const text = '- item\n  ```\n  code\n  ```\n- other'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle deeply nested quotes', async ({ page }) => {
    const text = '> > > > deeply nested'
    await setContent(page, text)
    const content = await getContent(page)
    expect(content).toBe(text)
  })

  test('should handle table with formatted cell content', async ({ page }) => {
    const text = '| A | B |\n| --- | --- |\n| **bold** | `code` |'
    await setContent(page, text)
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toContain('**bold**')
    expect(content).toContain('`code`')
  })
})

test.describe('Editor Extreme - Rapid Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle rapid typing without corruption', async ({ page }) => {
    await focusEditor(page)
    // Type quickly with minimal delay
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type(`line ${i}\n`, { delay: 1 })
    }
    await page.waitForTimeout(300)

    const content = await getContent(page)
    for (let i = 0; i < 10; i++) {
      expect(content).toContain(`line ${i}`)
    }
  })

  test('should handle rapid backspace without crash', async ({ page }) => {
    await setContent(page, 'abcdef')
    await focusEditor(page)
    await page.keyboard.press('End')

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Backspace')
    }
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toBe('')
  })

  test('should handle insertion of large content', async ({ page }) => {
    const largeText = 'paragraph\n\n'.repeat(50)
    await focusEditor(page)
    await page.evaluate((text) => {
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({
          changes: { from: 0, to: 0, insert: text },
        })
      }
    }, largeText)
    await page.waitForTimeout(500)

    const content = await getContent(page)
    expect(content.length).toBeGreaterThan(500)
  })
})
