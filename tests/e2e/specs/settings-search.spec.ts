import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
  })

  test('should have search input', async ({ page }) => {
    await expect(page.locator('[data-testid="settings-search-input"]')).toBeVisible()
  })

  test('should filter settings by search query', async ({ page }) => {
    const searchInput = page.locator('[data-testid="settings-search-input"]')
    await searchInput.fill('主题')

    const visibleTitles = await page.locator('.settings-section:visible .section-title').allTextContents()
    expect(visibleTitles).toContain('通用')
    expect(visibleTitles).not.toContain('编辑器')
    expect(visibleTitles).not.toContain('模型')
    expect(visibleTitles).not.toContain('Git')
  })

  test('should clear search and restore all settings', async ({ page }) => {
    const searchInput = page.locator('[data-testid="settings-search-input"]')
    await searchInput.fill('主题')
    await expect(page.locator('.settings-section:visible')).toHaveCount(1)

    await searchInput.fill('')
    const visibleTitles = await page.locator('.settings-section:visible .section-title').allTextContents()
    expect(visibleTitles.length).toBeGreaterThan(1)
    expect(visibleTitles).toContain('通用')
    expect(visibleTitles).toContain('编辑器')
  })

  test('should show no results for unmatched query', async ({ page }) => {
    const searchInput = page.locator('[data-testid="settings-search-input"]')
    await searchInput.fill('xyznonexistent123')

    const visibleSections = await page.locator('.settings-section:visible').count()
    expect(visibleSections).toBe(0)
  })
})
