import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { clearEditor, typeInEditor, getContent } from '../helpers/editor'

test.describe('Editor Context Menu Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  async function selectFirstWord(page: import('@playwright/test').Page) {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.up('Shift')
    await page.waitForTimeout(300)

    // Verify selection exists
    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return null
      const range = view.state.selection.main
      return { from: range.from, to: range.to, empty: range.empty }
    })
    expect(sel).not.toBeNull()
    expect(sel!.empty).toBe(false)
  }

  async function openContextMenuAtSelection(page: import('@playwright/test').Page) {
    const cmContent = page.locator('.cm-content')
    const box = await cmContent.boundingBox()
    expect(box).toBeTruthy()
    // Right-click within the selected text area (left side where "Hello" is)
    await page.mouse.click(box!.x + 25, box!.y + 25, { button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    return menu
  }

  test('should cut selected text', async ({ page }) => {
    await selectFirstWord(page)
    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '剪切' }).click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe(' World')
  })

  test('should copy selected text', async ({ page }) => {
    await selectFirstWord(page)
    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '复制' }).click()
    await page.waitForTimeout(300)

    // Content should remain unchanged
    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should not cut when no text is selected', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    await page.waitForTimeout(200)

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '剪切' }).click()
    await page.waitForTimeout(300)

    // Content should remain unchanged since selection is empty
    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should not copy when no text is selected', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    await page.waitForTimeout(200)

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '复制' }).click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test.skip('should paste text from clipboard', async ({ page }) => {
    // Skipped: navigator.clipboard is restricted in Wails WKWebView,
    // making paste via context menu untestable in e2e environment.
    await typeInEditor(page, 'Hello World')
    // Position cursor after "Hello"
    await page.keyboard.press('Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)

    // Mock clipboard API for Wails WebView where navigator.clipboard may be restricted
    await page.evaluate(() => {
      const mockClipboard = {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve('Inserted'),
      }
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: mockClipboard,
          configurable: true,
          writable: true,
        })
      } catch {
        (navigator as any).clipboard = mockClipboard
      }
    })

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '粘贴' }).click()
    await page.waitForTimeout(500)

    const content = await getContent(page)
    expect(content).toBe('HelloInserted World')
  })

  test.skip('should paste text replacing selection', async ({ page }) => {
    // Skipped: navigator.clipboard is restricted in Wails WKWebView.
    await selectFirstWord(page)

    await page.evaluate(() => {
      const mockClipboard = {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve('Hi'),
      }
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: mockClipboard,
          configurable: true,
          writable: true,
        })
      } catch {
        (navigator as any).clipboard = mockClipboard
      }
    })

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '粘贴' }).click()
    await page.waitForTimeout(500)

    const content = await getContent(page)
    expect(content).toBe('Hi World')
  })

  test.skip('should paste at end of document', async ({ page }) => {
    // Skipped: navigator.clipboard is restricted in Wails WKWebView.
    await typeInEditor(page, 'Hello')
    await page.keyboard.press('End')
    await page.waitForTimeout(200)

    await page.evaluate(() => {
      const mockClipboard = {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve(' World'),
      }
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: mockClipboard,
          configurable: true,
          writable: true,
        })
      } catch {
        (navigator as any).clipboard = mockClipboard
      }
    })

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('.ctx-item', { hasText: '粘贴' }).click()
    await page.waitForTimeout(500)

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })
})
