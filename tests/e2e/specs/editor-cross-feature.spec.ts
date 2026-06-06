import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import {
  getContent, setContent, clearEditor, focusEditor,
  setSelection, toggleRawMode,
} from '../helpers/editor'

test.describe('Editor Cross Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should toggle raw mode with active text selection without crash', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await setSelection(page, 0, 5) // select "Hello"
    await toggleRawMode(page, true)
    await page.waitForTimeout(200)
    const editorContainer = page.locator('.editor-container')
    await expect(editorContainer).toHaveClass(/raw-mode/)
    // Toggle back
    await toggleRawMode(page, false)
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should show raw markdown when toggling raw mode with table widget', async ({ page }) => {
    await setContent(page, '| A | B |\n|---|---|\n| 1 | 2 |')
    await page.waitForTimeout(300)
    const tableWidget = page.locator('.cm-table-widget')
    await expect(tableWidget).toBeVisible({ timeout: 3000 })
    // Toggle raw mode
    await toggleRawMode(page, true)
    await page.waitForTimeout(200)
    await expect(tableWidget).not.toBeVisible()
    const content = await getContent(page)
    expect(content).toContain('| A | B |')
    // Toggle back
    await toggleRawMode(page, false)
    await page.waitForTimeout(300)
    await expect(page.locator('.cm-table-widget')).toBeVisible({ timeout: 3000 })
  })

  test('should render math and mermaid widgets simultaneously', async ({ page }) => {
    await setContent(page, '# Math\n$$E=mc^2$$\n\n# Diagram\n```mermaid\ngraph TD\n  A --> B\n```')
    await page.waitForTimeout(500)
    const mathWidget = page.locator('.cm-math-block, .cm-math-preview')
    const mermaidWidget = page.locator('.cm-mermaid-preview, .cm-mermaid')
    await expect(mathWidget.first()).toBeVisible({ timeout: 3000 })
    await expect(mermaidWidget.first()).toBeVisible({ timeout: 3000 })
  })

  test('should allow typing in line right before table widget', async ({ page }) => {
    await setContent(page, '\n| A | B |\n|---|---|\n| 1 | 2 |')
    await page.waitForTimeout(300)
    await focusEditor(page)
    await setSelection(page, 0, 0)
    await page.keyboard.type('Prefix', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content.startsWith('Prefix')).toBe(true)
  })

  test('should allow typing right after math block', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$\n')
    await page.waitForTimeout(300)
    await focusEditor(page)
    // Content is 11 chars: $$E=mc^2$$\n, position 11 is after \n
    await setSelection(page, 11, 11)
    await page.keyboard.type('After', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    // Content should have math block intact with "After" after the closing $$
    expect(content).toMatch(/^\$\$E=mc\^2\$\$\nAfter/)
  })

  test('should handle rapid sequence: type -> bold -> undo -> type', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('ab', { delay: 10 })
    await setSelection(page, 0, 2)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    // Undo (reverts the bold operation, not the typing)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    await setSelection(page, 2, 2)
    await page.keyboard.type('cd', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('abcd')
  })

  test('should undo heading-to-list conversion correctly', async ({ page }) => {
    await setContent(page, 'Title')
    await focusEditor(page)
    // Click on the line to ensure proper focus for block shortcuts
    await page.locator('.cm-content').click()
    await page.waitForTimeout(100)
    // Convert to H1
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('# Title')

    // Convert to bullet list
    await page.keyboard.press('Control+Shift+8')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('- Title')

    // CM6 batches consecutive block conversions into a single undo transaction,
    // so one undo reverts all the way back to the original content
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('Title')
  })

  test('should undo list-to-heading conversion correctly', async ({ page }) => {
    await setContent(page, '- item')
    await focusEditor(page)
    // Click on the line to ensure proper focus for block shortcuts
    await page.locator('.cm-content').click()
    await page.waitForTimeout(100)
    // Convert to H1
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('# item')
    // Undo should revert to list
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('- item')
  })

  test('should render table widget adjacent to mermaid widget', async ({ page }) => {
    await setContent(page, '| H |\n|---|\n| V |\n\n```mermaid\ngraph TD\n  A --> B\n```')
    await page.waitForTimeout(500)
    const tableWidget = page.locator('.cm-table-widget')
    const mermaidWidget = page.locator('.cm-mermaid-preview')
    await expect(tableWidget.first()).toBeVisible({ timeout: 3000 })
    await expect(mermaidWidget.first()).toBeVisible({ timeout: 3000 })
    const content = await getContent(page)
    expect(content).toContain('| H |')
    expect(content).toContain('```mermaid')
  })

  test('should handle typing during rapid raw mode toggles', async ({ page }) => {
    await setContent(page, 'Hello')
    await focusEditor(page)
    // Rapid toggles
    await toggleRawMode(page, true)
    await toggleRawMode(page, false)
    await toggleRawMode(page, true)
    await toggleRawMode(page, false)
    await page.waitForTimeout(200)
    await setSelection(page, 5, 5)
    await page.keyboard.type(' World', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })
})
