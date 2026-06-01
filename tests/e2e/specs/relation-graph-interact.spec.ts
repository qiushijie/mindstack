import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Relation Graph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'relations')
    await page.waitForTimeout(500)
  })

  test('should navigate to relation graph page', async ({ page }) => {
    await expect(page.locator('.relation-graph')).toBeVisible()
  })

  test('should show search box', async ({ page }) => {
    await expect(page.locator('.graph-search-box')).toBeVisible()
  })

  test('should show graph area', async ({ page }) => {
    await expect(page.locator('.graph-area')).toBeVisible()
  })

  test('should show error state when Go bindings unavailable', async ({ page }) => {
    // In e2e (Vite dev mode) Go bindings are unavailable, loadData should fail
    const errorEl = page.locator('.graph-error')
    await expect(errorEl).toBeVisible()
  })

  test('should not show zoom controls without data', async ({ page }) => {
    // No data loaded → zoom controls should not appear
    await page.waitForTimeout(1000)
    const zoomControls = page.locator('.zoom-controls')
    await expect(zoomControls).toHaveCount(0)
  })
})
