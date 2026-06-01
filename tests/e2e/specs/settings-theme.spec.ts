import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
    await page.waitForTimeout(300)
  })

  test('should navigate to settings page', async ({ page }) => {
    await expect(page.locator('.settings')).toBeVisible()
  })

  test('should switch to dark theme', async ({ page }) => {
    const darkBtn = page.locator('.theme-btn').filter({ hasText: /深色|Dark/ })
    await darkBtn.click()
    await page.waitForTimeout(200)

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(theme).toBe('dark')
  })

  test('should switch to light theme', async ({ page }) => {
    // First switch to dark
    const darkBtn = page.locator('.theme-btn').filter({ hasText: /深色|Dark/ })
    await darkBtn.click()
    await page.waitForTimeout(200)

    // Then switch back to light
    const lightBtn = page.locator('.theme-btn').filter({ hasText: /浅色|Light/ })
    await lightBtn.click()
    await page.waitForTimeout(200)

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(theme).toBe('light')
  })

  test('should have active class on selected theme', async ({ page }) => {
    const lightBtn = page.locator('.theme-btn').filter({ hasText: /浅色|Light/ })
    await expect(lightBtn).toHaveClass(/active/)
  })
})
