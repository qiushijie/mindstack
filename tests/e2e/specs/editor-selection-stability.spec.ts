import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, setSelection, getSelectionRange, dragSelect, getCoordsAtPos, scrollToPosition } from '../helpers/editor'

test.describe('Selection Stability - Basic Text', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should place cursor and type in a plain paragraph', async ({ page }) => {
    await setContent(page, 'Hello world')
    await focusEditor(page)
    await setSelection(page, 6)
    await page.keyboard.type('NEW ', { delay: 10 })
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Hello NEW world')
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(10)
  })

  test('should drag-select within a paragraph', async ({ page }) => {
    await setContent(page, 'Hello world')
    await focusEditor(page)

    await dragSelect(page, 6, 11)
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(false)
    expect(sel.from).toBe(6)
    expect(sel.to).toBe(11)
  })

  test('should delete selected text and keep cursor at deletion point', async ({ page }) => {
    await setContent(page, 'Hello world')
    await focusEditor(page)
    await setSelection(page, 6, 11)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Hello ')
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(6)
  })

  test('should undo deletion and restore selection', async ({ page }) => {
    await setContent(page, 'Hello world')
    await focusEditor(page)
    await setSelection(page, 6, 11)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Hello world')
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(false)
    expect(sel.from).toBe(6)
    expect(sel.to).toBe(11)
  })
})

test.describe('Selection Stability - Headings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should click inside a heading and type without jumping', async ({ page }) => {
    await setContent(page, '# Title\n\nBody text')
    await focusEditor(page)
    await setSelection(page, 2)
    await page.keyboard.type('My ', { delay: 10 })
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('# My Title\n\nBody text')
  })

  test('should drag-select across heading and paragraph', async ({ page }) => {
    await setContent(page, '# Title\n\nBody text')
    await focusEditor(page)

    await dragSelect(page, 2, 13)
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(false)

    const content = await getContent(page)
    const selectedText = content.slice(sel.from, sel.to)
    expect(selectedText).toContain('Title')
    expect(selectedText).toContain('Body')
  })
})

test.describe('Selection Stability - Lists and Todo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should split list item with Enter and keep cursor', async ({ page }) => {
    await setContent(page, '- Item one')
    await focusEditor(page)
    await setSelection(page, 10)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('- Item one')
    expect(content).toMatch(/- Item one\n- /)

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(13)
  })

  test('should remove empty list marker with Backspace', async ({ page }) => {
    await setContent(page, '- Item one\n- ')
    await focusEditor(page)
    await setSelection(page, 13)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('- Item one')
    // Empty list marker should be removed or reduced to a plain line.
    expect(content.replace('- Item one', '').trim()).toBe('')
  })

  test('should indent list item with Tab', async ({ page }) => {
    await setContent(page, '- Item one\n- Item two')
    await focusEditor(page)
    await setSelection(page, 12)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('- Item one\n  - Item two')
  })

  test('should toggle todo checkbox without moving cursor to document start', async ({ page }) => {
    await setContent(page, '- [ ] Todo item')
    await focusEditor(page)
    await setSelection(page, 6)

    const checkbox = page.locator('.cm-todo-check').first()
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toHaveClass(/done/)
    await checkbox.click()
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toBe('- [x] Todo item')

    const sel = await getSelectionRange(page)
    expect(sel.from).toBeGreaterThan(0)
  })
})

test.describe('Selection Stability - Rapid Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should keep cursor position after rapid typing', async ({ page }) => {
    await setContent(page, 'Start ')
    await focusEditor(page)
    await setSelection(page, 6)
    await page.keyboard.type('abcde', { delay: 5 })
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Start abcde')
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(11)
  })

  test('should keep cursor position after rapid deletion', async ({ page }) => {
    await setContent(page, 'Start abcde')
    await focusEditor(page)
    await setSelection(page, 11)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Backspace')
    }
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Start ')
    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(6)
  })
})

test.describe('Selection Stability - Clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should select all and replace with typed text', async ({ page }) => {
    await setContent(page, 'Line one\nLine two')
    await focusEditor(page)
    await page.keyboard.press('Control+a')
    await page.waitForTimeout(100)
    await page.keyboard.type('replacement')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('replacement')
  })

  test.fixme('should copy and paste selected text', async ({ page }) => {
    await setContent(page, 'Hello world')
    await focusEditor(page)
    await setSelection(page, 6, 11)
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(100)
    await setSelection(page, 11)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(200)

    expect(await getContent(page)).toBe('Hello worldworld')
  })
})

test.describe('Selection Stability - Long Document', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  function generateDocument(lines: number): string {
    const out: string[] = []
    for (let i = 0; i < lines; i++) {
      out.push(`Line ${i + 1} with enough text to make a reasonably long document for scrolling tests.`)
    }
    return out.join('\n\n')
  }

  test('should scroll to target line and type without cursor jump', async ({ page }) => {
    const doc = generateDocument(100)
    await setContent(page, doc)
    await page.waitForTimeout(300)

    // Compute position right after "Line 50".
    const linePrefix = 'Line 50'
    const pos = doc.indexOf(linePrefix)
    expect(pos).toBeGreaterThan(0)
    const targetPos = pos + linePrefix.length

    // Focus first, then scroll to the target line and place the cursor there.
    await focusEditor(page)
    await scrollToPosition(page, targetPos)

    const coords = await getCoordsAtPos(page, targetPos)
    expect(coords).toBeTruthy()

    // Click at the target position to mirror a real user action, then type.
    await page.mouse.click(coords!.x, coords!.y)
    await page.waitForTimeout(200)
    await page.keyboard.type(' EDITED')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('Line 50 EDITED')

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(targetPos + ' EDITED'.length)
  })
})
