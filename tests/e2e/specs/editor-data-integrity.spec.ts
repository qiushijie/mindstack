import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, setSelection } from '../helpers/editor'

test.describe('Editor Data Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should not change content when pressing Backspace at document start', async ({ page }) => {
    await setContent(page, 'content')
    await focusEditor(page)
    await setSelection(page, 0)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('content')
  })

  test('should insert newline when pressing Enter at document start', async ({ page }) => {
    await setContent(page, 'content')
    await focusEditor(page)
    await setSelection(page, 0)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('\ncontent')
  })

  test('should preserve setext heading when typing after it', async ({ page }) => {
    await setContent(page, 'Title\n===')
    await focusEditor(page)
    // Cursor at end of content
    await setSelection(page, 9, 9)
    await page.keyboard.type('\nMore content', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    // Setext heading should remain intact, new content appended
    expect(content).toContain('Title\n===')
    expect(content).toContain('More content')
  })

  test('should handle Enter in setext heading text correctly', async ({ page }) => {
    await setContent(page, 'Long Title\n====')
    await focusEditor(page)
    // Press Enter after "Long" (pos 4)
    await setSelection(page, 4, 4)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    const lines = content.split('\n')
    // Content should split into lines without corruption
    expect(lines.length).toBeGreaterThanOrEqual(3)
    // Setext markers should not corrupt — first part should still be valid
    expect(content).toContain('Long')
    expect(content).toContain('Title')
  })
})
