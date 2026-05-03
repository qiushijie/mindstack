import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
  })

  test('should display general section', async ({ page }) => {
    const titles = page.locator('.settings-content .section-title')
    await expect(titles.first()).toContainText('General')
  })

  test('should display editor section', async ({ page }) => {
    const titles = page.locator('.settings-content .section-title')
    await expect(titles.filter({ hasText: 'Editor' })).toBeVisible()
  })

  test('should display git section', async ({ page }) => {
    const titles = page.locator('.settings-content .section-title')
    await expect(titles.filter({ hasText: 'Git' })).toBeVisible()
  })

  test('should display about section', async ({ page }) => {
    const titles = page.locator('.settings-content .section-title')
    await expect(titles.filter({ hasText: 'About' })).toBeVisible()
  })
})
