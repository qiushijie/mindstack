import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

test.describe('App Empty State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should show empty sidebar when no workspace is open', async ({ page }) => {
    // By default, no workspace should be open in e2e tests
    const emptyState = page.locator('.sidebar-empty')
    await expect(emptyState).toBeVisible()
  })

  test('should show empty hint text', async ({ page }) => {
    const emptyHint = page.locator('.sidebar-empty .empty-text')
    await expect(emptyHint).toBeVisible()
    const text = await emptyHint.textContent()
    expect(text).toBeTruthy()
  })

  test('should not show file tree when no workspace is open', async ({ page }) => {
    // Tree items should not exist
    const treeItems = page.locator('.sidebar .tree-item')
    expect(await treeItems.count()).toBe(0)
  })

  test('should show editor area', async ({ page }) => {
    await expect(page.locator('.cm-editor')).toBeVisible()
  })
})
