import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should start on the editor page', async ({ page }) => {
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.cm-editor')).toBeVisible()
  })

  test('should navigate to settings page', async ({ page }) => {
    await navigateTo(page, 'settings')

    await expect(page.locator('.settings')).toBeVisible()
    await expect(page.locator('.settings-nav')).toBeVisible()
  })

  test('should navigate back to editor from settings', async ({ page }) => {
    await navigateTo(page, 'settings')
    await expect(page.locator('.settings')).toBeVisible()

    await navigateTo(page, 'editor')
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.settings')).toBeHidden()
  })

  test('should show all settings nav items', async ({ page }) => {
    await navigateTo(page, 'settings')

    const navItems = page.locator('.settings-nav .nav-item')
    await expect(navItems).toHaveCount(4)
    await expect(navItems.nth(0)).toContainText('General')
    await expect(navItems.nth(1)).toContainText('Editor')
    await expect(navItems.nth(2)).toContainText('Git')
    await expect(navItems.nth(3)).toContainText('About')
  })

  test('should switch settings sections', async ({ page }) => {
    await navigateTo(page, 'settings')

    await page.locator('.nav-item').filter({ hasText: 'Editor' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('Editor')

    await page.locator('.nav-item').filter({ hasText: 'Git' }).click()
    await expect(page.locator('.settings-content .section-title')).toContainText('Git')
  })
})
