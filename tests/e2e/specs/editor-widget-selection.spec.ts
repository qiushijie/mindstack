import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, setSelection, getSelectionRange, moveCursorToEnd, dragSelect } from '../helpers/editor'

test.describe('Widget Selection - Image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should click image preview to enter source edit mode', async ({ page }) => {
    await setContent(page, '![alt](https://example.com/img.png)')
    await focusEditor(page)
    await moveCursorToEnd(page)

    const widget = page.locator('.cm-image-container')
    await expect(widget).toBeVisible()

    const box = await widget.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(500)

    // Widget should disappear because cursor is inside the image source range.
    await expect(widget).not.toBeVisible()

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBeGreaterThan(0)
    expect(sel.from).toBeLessThan(34)
  })

  test('should drag-select from before image to after image', async ({ page }) => {
    await setContent(page, 'Before ![alt](https://example.com/img.png) After')
    await focusEditor(page)

    const before = 0
    const after = (await getContent(page)).length
    await dragSelect(page, before, after)

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(false)
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(after)
  })
})

test.describe('Widget Selection - Math', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should click math preview to enter source edit mode', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$')
    await focusEditor(page)
    await moveCursorToEnd(page)

    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    const box = await widget.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(500)

    await expect(widget).not.toBeVisible()

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBeGreaterThanOrEqual(2)
    expect(sel.from).toBeLessThanOrEqual(10)
  })
})

test.describe('Widget Selection - Mermaid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should click mermaid preview and edit button to set selection correctly', async ({ page }) => {
    await setContent(page, '```mermaid\ngraph TD\n  A --> B\n```')
    await focusEditor(page)
    await moveCursorToEnd(page)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    // Click the preview area first, then the edit button.
    const box = await preview.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const editBtn = page.locator('.cm-mermaid-edit-btn')
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click()
      await page.waitForTimeout(300)
    }

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBeGreaterThan(0)
    expect(sel.from).toBeLessThan((await getContent(page)).length)
  })
})

test.describe('Widget Selection - Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should click table cell to open floating input and update content', async ({ page }) => {
    await setContent(page, '| A | B |\n|---|---|\n| 1 | 2 |')
    await focusEditor(page)
    await moveCursorToEnd(page)

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    const cell = widget.locator('td').first()
    await cell.click()
    await page.waitForTimeout(300)

    const input = page.locator('.cm-table-cell-input')
    await expect(input).toBeVisible()
    await input.fill('X')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    await expect(input).not.toBeVisible()
    const content = await getContent(page)
    expect(content).toContain('X')

    const sel = await getSelectionRange(page)
    expect(sel.from).toBeGreaterThan(0)
  })

  test('should not move cursor to document start after context menu add row', async ({ page }) => {
    await setContent(page, '| A | B |\n|---|---|\n| 1 | 2 |')
    await focusEditor(page)
    await moveCursorToEnd(page)

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    const cell = widget.locator('td').first()
    await cell.click({ button: 'right' })
    await page.waitForTimeout(300)

    const menu = page.locator('.context-menu, [role="menu"]')
    const addRow = menu.locator('.ctx-item', { hasText: '插入行' }).first()
    if (await addRow.isVisible().catch(() => false)) {
      await addRow.click()
      await page.waitForTimeout(300)
    } else {
      test.skip(true, 'Table context menu not available')
      return
    }

    const sel = await getSelectionRange(page)
    expect(sel.from).toBeGreaterThan(0)
  })

  test('should remove floating input after widget is destroyed', async ({ page }) => {
    await setContent(page, '| A | B |\n|---|---|\n| 1 | 2 |')
    await focusEditor(page)
    await moveCursorToEnd(page)

    const widget = page.locator('.cm-table-widget')
    await expect(widget).toBeVisible()

    const cell = widget.locator('td').first()
    await cell.click()
    await page.waitForTimeout(300)

    const input = page.locator('.cm-table-cell-input')
    await expect(input).toBeVisible()

    // Move cursor out of table to destroy widget preview.
    await setSelection(page, 0)
    await page.waitForTimeout(500)

    await expect(input).not.toBeVisible()
  })
})
