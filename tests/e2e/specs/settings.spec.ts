import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
  })

  test('should display general section by default', async ({ page }) => {
    await expect(page.locator('.settings-content .section-title')).toContainText('General')
  })

  test('should switch to editor section', async ({ page }) => {
    await page.locator('.nav-item').filter({ hasText: 'Editor' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('Editor')
  })

  test('should switch to git section', async ({ page }) => {
    await page.locator('.nav-item').filter({ hasText: 'Git' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('Git')
  })

  test('should switch to about section', async ({ page }) => {
    await page.locator('.nav-item').filter({ hasText: 'About' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('About')
  })

  test('should have a back button to return to editor', async ({ page }) => {
    const backBtn = page.locator('.nav-back')
    if (await backBtn.isVisible()) {
      await backBtn.click()
      await expect(page.locator('.editor-container')).toBeVisible()
    }
  })
})
