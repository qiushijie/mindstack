import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, clearEditor, focusEditor, getSelectionRange } from '../helpers/editor'

test.describe('IME Composition Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle simulated composition events without crash', async ({ page }) => {
    await focusEditor(page)

    const cmContent = page.locator('.cm-content')
    const supported = await cmContent.evaluate((el) => {
      try {
        const start = new CompositionEvent('compositionstart', { data: '' })
        const update = new CompositionEvent('compositionupdate', { data: 'zhongwen' })
        const end = new CompositionEvent('compositionend', { data: '中文' })
        el.dispatchEvent(start)
        el.dispatchEvent(update)
        el.dispatchEvent(end)
        return true
      } catch {
        return false
      }
    })

    if (!supported) {
      test.skip(true, 'CompositionEvent not supported in this browser')
      return
    }

    await page.waitForTimeout(200)

    const sel = await getSelectionRange(page)
    expect(sel.from).toBeGreaterThanOrEqual(0)
    const content = await getContent(page)
    expect(content.length).toBeGreaterThanOrEqual(0)
  })

  test('should input real CJK text via keyboard', async ({ page }) => {
    await focusEditor(page)

    await page.keyboard.insertText('中文')

    const content = await getContent(page)
    expect(content).toBe('中文')

    const sel = await getSelectionRange(page)
    expect(sel.from).toBe(2)
    expect(sel.to).toBe(2)
    expect(sel.empty).toBe(true)
  })
})
