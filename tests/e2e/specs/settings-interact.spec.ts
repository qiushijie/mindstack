import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
  })

  test('should show theme buttons in General section', async ({ page }) => {
    const lightBtn = page.locator('button.theme-btn').filter({ hasText: 'Light' })
    const darkBtn = page.locator('button.theme-btn').filter({ hasText: 'Dark' })
    await expect(lightBtn).toBeVisible()
    await expect(darkBtn).toBeVisible()
  })

  test('should toggle theme from Light to Dark', async ({ page }) => {
    const darkBtn = page.locator('button.theme-btn').filter({ hasText: 'Dark' })
    await darkBtn.click()
    await expect(darkBtn).toHaveClass(/active/)
  })

  test('should show Auto Save toggle in General section', async ({ page }) => {
    const autoSaveRow = page.locator('.setting-row').filter({ hasText: 'Auto Save' })
    const toggle = autoSaveRow.locator('.toggle')
    await expect(toggle).toBeVisible()
  })

  test('should toggle Auto Save on and off', async ({ page }) => {
    const autoSaveRow = page.locator('.setting-row').filter({ hasText: 'Auto Save' })
    const toggle = autoSaveRow.locator('.toggle')
    const wasOn = await toggle.evaluate((el) => el.classList.contains('on'))

    await toggle.click()
    if (wasOn) {
      await expect(toggle).not.toHaveClass(/on/)
    } else {
      await expect(toggle).toHaveClass(/on/)
    }
  })

  test('should toggle Line Numbers', async ({ page }) => {
    const row = page.locator('.setting-row').filter({ hasText: 'Line Numbers' })
    const toggle = row.locator('.toggle')
    const wasOn = await toggle.evaluate((el) => el.classList.contains('on'))

    await toggle.click()
    if (wasOn) {
      await expect(toggle).not.toHaveClass(/on/)
    } else {
      await expect(toggle).toHaveClass(/on/)
    }
  })

  test('should toggle Word Wrap', async ({ page }) => {
    const row = page.locator('.setting-row').filter({ hasText: 'Word Wrap' })
    const toggle = row.locator('.toggle')
    const wasOn = await toggle.evaluate((el) => el.classList.contains('on'))

    await toggle.click()
    if (wasOn) {
      await expect(toggle).not.toHaveClass(/on/)
    } else {
      await expect(toggle).toHaveClass(/on/)
    }
  })

  test('should show Auto Commit toggle in Git section', async ({ page }) => {
    const autoCommitRow = page.locator('.setting-row').filter({ hasText: 'Auto Commit' })
    const toggle = autoCommitRow.locator('.toggle')
    await expect(toggle).toBeVisible()
  })

  test('should toggle Auto Commit', async ({ page }) => {
    const row = page.locator('.setting-row').filter({ hasText: 'Auto Commit' })
    const toggle = row.locator('.toggle')
    const wasOn = await toggle.evaluate((el) => el.classList.contains('on'))

    await toggle.click()
    if (wasOn) {
      await expect(toggle).not.toHaveClass(/on/)
    } else {
      await expect(toggle).toHaveClass(/on/)
    }
  })

  test('should show app info in About section', async ({ page }) => {
    const content = page.locator('.settings-content')
    await expect(content).not.toBeEmpty()
    const aboutName = page.locator('.about-name')
    await expect(aboutName).toBeVisible()
  })
})
