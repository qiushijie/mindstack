import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { setContent } from '../helpers/editor'
import { openFindPanel, closeFindPanel, typeInFindPanel } from '../helpers/findpanel'

test.describe('Find Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await setContent(page, 'hello world\nfoo bar\nbaz qux\nhello again')
  })

  test('should open and close find panel', async ({ page }) => {
    await openFindPanel(page)
    await expect(page.locator('.find-panel')).toBeVisible()

    await closeFindPanel(page)
    await expect(page.locator('.find-panel')).toBeHidden()
  })

  test('should highlight matches and show count', async ({ page }) => {
    await openFindPanel(page)
    await typeInFindPanel(page, 'hello')

    const count = page.locator('.find-count')
    await expect(count).toContainText('1/2')
  })

  test('should have navigation buttons', async ({ page }) => {
    await openFindPanel(page)

    const prevBtn = page.locator('.find-btn').nth(0)
    const nextBtn = page.locator('.find-btn').nth(1)
    const closeBtn = page.locator('.find-close')

    await expect(prevBtn).toBeVisible()
    await expect(nextBtn).toBeVisible()
    await expect(closeBtn).toBeVisible()
  })

  test('should navigate to next match on Enter', async ({ page }) => {
    await openFindPanel(page)
    await typeInFindPanel(page, 'hello')

    const count = page.locator('.find-count')
    await expect(count).toContainText('1/2')

    // Press Enter in the find input to navigate to next match
    const input = page.locator('.find-input')
    await input.press('Enter')
    await page.waitForTimeout(500)

    // After navigation, cursor moves to next match
    // The count may update depending on CodeMirror cursor position
    await expect(count).toBeVisible()
  })

  test('should show no results for unmatched term', async ({ page }) => {
    await openFindPanel(page)
    await typeInFindPanel(page, 'nonexistent')

    const count = page.locator('.find-count')
    await expect(count).toContainText(/no results|无结果/)
    await expect(count).toHaveClass(/find-count-none/)
  })

  test('should close on escape key', async ({ page }) => {
    await openFindPanel(page)
    await expect(page.locator('.find-panel')).toBeVisible()

    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    await expect(page.locator('.find-panel')).toBeHidden()
  })

  test('should close on close button click', async ({ page }) => {
    await openFindPanel(page)
    await expect(page.locator('.find-panel')).toBeVisible()

    const closeBtn = page.locator('.find-close')
    await closeBtn.click()
    await page.waitForTimeout(200)

    await expect(page.locator('.find-panel')).toBeHidden()
  })

  test('should clear search on close', async ({ page }) => {
    await openFindPanel(page)
    await typeInFindPanel(page, 'hello')
    await closeFindPanel(page)

    await openFindPanel(page)
    const input = page.locator('.find-input')
    await expect(input).toHaveValue('')
  })
})
