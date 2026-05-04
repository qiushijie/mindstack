import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, focusEditor } from '../helpers/editor'

test.describe('Editor Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await setContent(page, '')
  })

  async function openSearch(page: import('@playwright/test').Page) {
    // Focus the CM6 view without moving the cursor (unlike focusEditor which clicks)
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-panel')).toBeVisible()
  }

  test('should open search panel with Cmd+F', async ({ page }) => {
    await setContent(page, 'hello world\nhello universe\nhello everyone')
    await openSearch(page)

    // Input should be focused
    await expect(page.locator('.find-input')).toBeFocused()
  })

  test('should show match count when typing search term', async ({ page }) => {
    await setContent(page, 'hello world\nhello universe\nhello everyone')
    await openSearch(page)

    await page.keyboard.type('hello', { delay: 20 })

    // Wait for debounce + render
    await page.waitForTimeout(300)

    // Should show match count (3 matches)
    const countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('3')
  })

  test('should show no results for non-matching search', async ({ page }) => {
    await setContent(page, 'hello world')
    await openSearch(page)

    await page.keyboard.type('xyz', { delay: 20 })
    await page.waitForTimeout(300)

    await expect(page.locator('.find-count-none')).toBeVisible()
  })

  test('should navigate matches with Enter and Shift+Enter', async ({ page }) => {
    await setContent(page, 'aaa bbb\naaa ccc\naaa ddd')
    await openSearch(page)

    await page.keyboard.type('aaa', { delay: 20 })
    await page.waitForTimeout(300)

    // Should show match count
    const countText = await page.locator('.find-count').textContent()
    expect(countText).toMatch(/\d+\/3/)

    // Get cursor position before Enter
    const cursorBefore = await page.evaluate(() => {
      const v = (window as any).__cmView
      return v ? v.state.selection.main.head : -1
    })

    // Navigate to next match
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    const cursorAfter = await page.evaluate(() => {
      const v = (window as any).__cmView
      return v ? v.state.selection.main.head : -1
    })
    // Cursor should have moved (different position)
    expect(cursorAfter).not.toBe(cursorBefore)
  })

  test('should close search panel with Escape', async ({ page }) => {
    await setContent(page, 'hello world')
    await openSearch(page)

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(page.locator('.find-panel')).toBeHidden()
  })

  test('should toggle with Cmd+F', async ({ page }) => {
    await setContent(page, 'hello world')
    // Focus without moving cursor
    await page.evaluate(() => (window as any).__cmView?.focus())

    // Open
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-panel')).toBeVisible()

    // Close with Cmd+F toggle
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-panel')).toBeHidden()

    // Open again
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-panel')).toBeVisible()
  })

  test('should clear search term when closing', async ({ page }) => {
    await setContent(page, 'hello world hello')
    await openSearch(page)

    await page.keyboard.type('hello', { delay: 20 })
    await page.waitForTimeout(300)

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(page.locator('.find-panel')).toBeHidden()

    // Re-open - search input should be empty
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-input')).toHaveValue('')
  })

  test('should reflect updated document content after reopening', async ({ page }) => {
    await setContent(page, 'abc def')
    await openSearch(page)

    await page.keyboard.type('abc', { delay: 20 })
    await page.waitForTimeout(300)

    let countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('1')

    // Close search
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Modify document to add more matches
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: 'abc def abc abc' },
          selection: { anchor: 0 },
        })
      }
    })
    await page.waitForTimeout(200)

    // Re-open search and type term
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await page.waitForTimeout(100)
    await page.keyboard.type('abc', { delay: 20 })
    await page.waitForTimeout(300)

    countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('3')
  })
})
