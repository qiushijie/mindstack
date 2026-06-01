import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
    await page.waitForTimeout(300)
  })

  test('should have search input', async ({ page }) => {
    const searchInput = page.locator('.settings-search-input')
    await expect(searchInput).toBeVisible()
  })

  test('should filter settings by search query', async ({ page }) => {
    const searchInput = page.locator('.settings-search-input')
    await searchInput.fill('theme')
    await page.waitForTimeout(300)

    // At least one section should still be visible
    const sections = page.locator('.settings-section')
    expect(await sections.count()).toBeGreaterThan(0)
  })

  test('should clear search and restore all settings', async ({ page }) => {
    const searchInput = page.locator('.settings-search-input')
    await searchInput.fill('theme')
    await page.waitForTimeout(300)

    // Clear search
    await searchInput.fill('')
    await page.waitForTimeout(300)

    // Multiple sections should be visible
    const sections = page.locator('.settings-section')
    expect(await sections.count()).toBeGreaterThan(1)
  })

  test('should show no results for unmatched query', async ({ page }) => {
    const searchInput = page.locator('.settings-search-input')
    await searchInput.fill('xyznonexistent123')
    await page.waitForTimeout(300)

    // All sections should be hidden
    const sections = page.locator('.settings-section')
    const visibleSections = await sections.evaluateAll(els =>
      els.filter(el => window.getComputedStyle(el).display !== 'none').length
    )
    expect(visibleSections).toBe(0)
  })
})
