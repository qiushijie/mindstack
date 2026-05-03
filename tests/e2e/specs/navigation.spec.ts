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
    await expect(page.locator('.settings-content')).toBeVisible()
  })

  test('should navigate back to editor from settings', async ({ page }) => {
    await navigateTo(page, 'settings')
    await expect(page.locator('.settings')).toBeVisible()

    await navigateTo(page, 'editor')
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.settings')).toBeHidden()
  })
})
