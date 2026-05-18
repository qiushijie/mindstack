import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Empty Line Placeholder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should show placeholder when editor is focused and empty', async ({ page }) => {
    await focusEditor(page)
    await page.waitForTimeout(200)

    const placeholder = page.locator('.cm-empty-line-placeholder')
    await expect(placeholder).toBeVisible()
  })

  test('should hide placeholder when text is typed', async ({ page }) => {
    await focusEditor(page)
    await page.waitForTimeout(200)

    await page.keyboard.type('hello')
    await page.waitForTimeout(200)

    const placeholder = page.locator('.cm-empty-line-placeholder')
    await expect(placeholder).not.toBeVisible()
  })

  test('should show placeholder on empty lines in multi-line doc', async ({ page }) => {
    await setContent(page, 'line one\n\nline three')
    await focusEditor(page)

    // Click on the empty line (line 2)
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        const line = view.state.doc.line(2)
        view.dispatch({ selection: { anchor: line.from } })
      }
    })
    await page.waitForTimeout(200)

    const placeholder = page.locator('.cm-empty-line-placeholder')
    await expect(placeholder).toBeVisible()
  })

  test('should hide placeholder when editor loses focus', async ({ page }) => {
    await focusEditor(page)
    await page.waitForTimeout(200)

    // Click outside editor
    await page.click('body', { position: { x: 0, y: 0 } })
    await page.waitForTimeout(200)

    const placeholder = page.locator('.cm-empty-line-placeholder')
    await expect(placeholder).not.toBeVisible()
  })

  test('should not show placeholder when slash menu is active', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/')
    await page.waitForTimeout(200)

    const placeholder = page.locator('.cm-empty-line-placeholder')
    await expect(placeholder).not.toBeVisible()
  })
})
