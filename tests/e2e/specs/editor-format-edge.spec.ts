import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, setSelection } from '../helpers/editor'

test.describe('Editor Format Edge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should toggle bold off when selection is inside bold markers', async ({ page }) => {
    await setContent(page, 'Hello **bold** world')
    await focusEditor(page)
    // Select "bold" (pos 8-12) — inside ** markers, NOT including them
    await setSelection(page, 8, 12)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('Hello bold world')
  })

  test('should preserve markdown structure when applying strikethrough to bold text', async ({ page }) => {
    await setContent(page, '**bold** text')
    await focusEditor(page)
    // Select whole content (13 chars)
    await setSelection(page, 0, 13)
    await page.keyboard.press('Control+Shift+s')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toContain('**bold**')
    expect(content.startsWith('~~')).toBe(true)
    expect(content.endsWith('~~')).toBe(true)
  })

  test('should not duplicate backticks when toggling code on inline code', async ({ page }) => {
    await setContent(page, 'some `code` here')
    await focusEditor(page)
    // Select "code" (pos 6-10) — inside backticks, NOT including them
    await setSelection(page, 6, 10)
    await page.keyboard.press('Control+`')
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('some code here')
  })

  test('should replace bold content when typing over selection', async ({ page }) => {
    await setContent(page, 'Hello **bold** World')
    await focusEditor(page)
    // Select "Hello **bold** " (pos 0-15) — includes the trailing space
    await setSelection(page, 0, 15)
    await page.keyboard.type('Hi ', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    // Typing over formatted content should replace cleanly without orphaned markers
    expect(content).toBe('Hi World')
  })

  test('should handle format-delete-format sequence', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    // Select "Hello" and bold it
    await setSelection(page, 0, 5)
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe('**Hello** World')

    // Delete the formatted part — "**Hello**" is 9 chars (pos 0-9)
    await setSelection(page, 0, 9)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    expect(await getContent(page)).toBe(' World')

    // Type replacement — cursor at pos 0
    await page.keyboard.type('Hi', { delay: 10 })
    await page.waitForTimeout(200)
    const content = await getContent(page)
    expect(content).toBe('Hi World')
  })
})
