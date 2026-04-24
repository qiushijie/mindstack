import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, setContent, typeInEditor, selectAll, getStatusText, focusEditor } from '../helpers/editor'

test.describe('Editor Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    // Clear any restored content
    await setContent(page, '')
  })

  test('should type text into the editor', async ({ page }) => {
    await typeInEditor(page, 'Hello, World!')

    const content = await getContent(page)
    expect(content).toContain('Hello, World!')
  })

  test('should type multi-line text', async ({ page }) => {
    await typeInEditor(page, 'Line 1')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Line 2')

    const content = await getContent(page)
    expect(content).toContain('Line 1')
    expect(content).toContain('Line 2')
  })

  test('should delete text with backspace', async ({ page }) => {
    await typeInEditor(page, 'Hello')

    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')

    const content = await getContent(page)
    expect(content).toContain('Hel')
    expect(content).not.toContain('Hello')
  })

  test('should update word count in status bar', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    // Wait for status bar to update
    await page.waitForTimeout(300)

    const statusTexts = await getStatusText(page)
    const wordsText = statusTexts.find((t) => t.includes('words'))
    expect(wordsText).toBeTruthy()
    expect(wordsText!).toContain('2 words')
  })

  test('should update cursor position in status bar', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.keyboard.press('Enter')
    await page.keyboard.type('World')
    await page.waitForTimeout(300)

    const statusTexts = await getStatusText(page)
    const posText = statusTexts.find((t) => t.includes('Ln'))
    expect(posText).toBeTruthy()
    expect(posText!).toContain('Ln 2')
  })

  test('should select all text', async ({ page }) => {
    await setContent(page, 'Line 1\nLine 2\nLine 3')
    await focusEditor(page)
    await selectAll(page)

    const content = await getContent(page)
    expect(content).toBe('Line 1\nLine 2\nLine 3')
  })

  test('should clear editor and set new content', async ({ page }) => {
    await typeInEditor(page, 'Old content')
    await setContent(page, 'New content')

    const content = await getContent(page)
    expect(content).toBe('New content')
  })
})
