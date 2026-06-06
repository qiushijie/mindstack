import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, setSelection } from '../helpers/editor'

test.describe('Editor List Nested', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should create correct indentation on Enter in 3-level nested list', async ({ page }) => {
    await setContent(page, '- Level 1\n  - Level 2\n    - Level 3')
    await focusEditor(page)
    // "    - Level 3" ends at pos 35, cursor after "Level 3"
    await setSelection(page, 35, 35)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toContain('    - ')
    expect(content.split('\n').length).toBe(4)
  })

  test('should handle Enter in ordered list inside bullet list', async ({ page }) => {
    await setContent(page, '- Parent\n  1. Child')
    await focusEditor(page)
    // Cursor after "Child" = pos 19
    await setSelection(page, 19, 19)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    const lines = content.split('\n')
    expect(lines.length).toBe(3)
    // New line (index 1) should continue ordered list with correct indentation
    expect(lines[1]).toMatch(/^  \d+[.)] /)
  })

  test('should indent line with Tab in list', async ({ page }) => {
    await setContent(page, '- Item')
    await focusEditor(page)
    await setSelection(page, 0, 0)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('  - Item')
  })

  test('should outdent line with Shift+Tab in indented list', async ({ page }) => {
    await setContent(page, '  - Item')
    await focusEditor(page)
    await setSelection(page, 0, 0)
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('- Item')
  })

  test('should clear empty list line on Enter', async ({ page }) => {
    await setContent(page, '- ')
    await focusEditor(page)
    await setSelection(page, 2, 2) // after "- "
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content.trim()).toBe('')
  })

  test('should handle Enter in blockquote with continuation', async ({ page }) => {
    await setContent(page, '> quote text')
    await focusEditor(page)
    await setSelection(page, 12, 12) // after "quote text"
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    const lines = content.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // Second line should have blockquote prefix
    expect(lines[1].trim()).toContain('>')
  })

  test('should handle Enter in ordered list with correct numbering', async ({ page }) => {
    await setContent(page, '1. First')
    await focusEditor(page)
    await setSelection(page, 8, 8) // after "First"
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    const lines = content.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // Second line should start with "2." for ordered list continuation
    expect(lines[1].trim()).toMatch(/^2[.)]\s?/)
  })

  test('should handle rapid Enter in list without corruption', async ({ page }) => {
    await setContent(page, '- Item')
    await focusEditor(page)
    await setSelection(page, 6, 6) // after "Item"
    // Press Enter multiple times quickly
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter')
    }
    await page.waitForTimeout(200)
    const content = await getContent(page)
    const lines = content.split('\n')
    // All non-empty lines must still be valid list items (no corrupted content)
    const nonEmpty = lines.filter(l => l.trim())
    for (const line of nonEmpty) {
      expect(line.trim()).toMatch(/^(- |\d+[.)]\s?)/)
    }
    // Content should have changed (not stuck in broken state)
    expect(content).not.toBe('- Item')
  })
})
