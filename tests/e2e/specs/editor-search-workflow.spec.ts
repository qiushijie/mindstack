import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent } from '../helpers/editor'

test.describe('Editor Search Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await setContent(page, '')
  })

  async function openSearch(page: import('@playwright/test').Page) {
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-panel')).toBeVisible()
  }

  async function typeSearchTerm(page: import('@playwright/test').Page, term: string) {
    await page.keyboard.type(term, { delay: 20 })
    await page.waitForTimeout(300)
  }

  test('should update match count after editing near match', async ({ page }) => {
    await setContent(page, 'apple banana apple cherry apple')
    await openSearch(page)
    await typeSearchTerm(page, 'apple')

    let countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('3')

    // Close search and edit document (replace first "apple" with "orange")
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({
          changes: { from: 0, to: 5, insert: 'orange' },
        })
      }
    })
    await page.waitForTimeout(200)

    // Re-open search and re-type term
    await openSearch(page)
    await typeSearchTerm(page, 'apple')

    countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('2')
  })

  test('should handle search across document changes', async ({ page }) => {
    await setContent(page, 'hello world')
    await openSearch(page)
    await typeSearchTerm(page, 'hello')

    let countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('1')

    // Close and replace entire document
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: 'hello hello hello' },
          selection: { anchor: 0 },
        })
      }
    })
    await page.waitForTimeout(200)

    // Re-open search and re-type term
    await openSearch(page)
    await typeSearchTerm(page, 'hello')

    countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('3')
  })

  test('should navigate matches then edit without crash', async ({ page }) => {
    await setContent(page, 'cat dog cat bird cat fish')
    await openSearch(page)
    await typeSearchTerm(page, 'cat')

    let countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('/3')

    // Navigate to next match (Enter advances)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    // Current match index should have changed
    const countAfterNav = await page.locator('.find-count').textContent()
    expect(countAfterNav).toContain('/3')

    // Close search and edit at cursor position
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    await page.keyboard.type(' [EDITED]')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('[EDITED]')
  })

  test('should handle rapid search-open-edit-close cycles', async ({ page }) => {
    await setContent(page, 'test content here')
    await openSearch(page)
    await typeSearchTerm(page, 'content')

    let countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('1')

    // Close
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Edit
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({
          changes: { from: 5, to: 12, insert: 'data' },
        })
      }
    })
    await page.waitForTimeout(200)

    // Re-open and search for new term
    await openSearch(page)
    await typeSearchTerm(page, 'data')

    countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('1')

    // Close again
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Edit again
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({
          changes: { from: 5, to: 9, insert: 'info' },
        })
      }
    })
    await page.waitForTimeout(200)

    // Re-open once more with original term
    await openSearch(page)
    await typeSearchTerm(page, 'content')

    // Should show no results since "content" is no longer in doc
    await expect(page.locator('.find-count-none')).toBeVisible()
  })

  test('should clear search query when closing', async ({ page }) => {
    await setContent(page, 'hello world hello')
    await openSearch(page)
    await typeSearchTerm(page, 'hello')

    let countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('2')

    // Close search
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Re-open search - input should be empty and no highlights
    await openSearch(page)
    await page.waitForTimeout(200)

    await expect(page.locator('.find-input')).toHaveValue('')
  })

  test('should handle search in document with widgets', async ({ page }) => {
    await setContent(page, 'Text before\n\n$$E=mc^2$$\n\nText after')
    await openSearch(page)
    await typeSearchTerm(page, 'Text')

    const countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('2')

    // Navigate to first match
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    // Move cursor out of math to trigger widget
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    // Math widget should be visible and search should still work
    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Search panel should still show results
    const countText2 = await page.locator('.find-count').textContent()
    expect(countText2).toContain('2')
  })
})
