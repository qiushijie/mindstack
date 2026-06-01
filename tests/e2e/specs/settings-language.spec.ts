import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

test.describe('Settings Language', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await navigateTo(page, 'settings')
    await page.waitForTimeout(300)
  })

  test('should show language dropdown', async ({ page }) => {
    const langDropdown = page.locator('.select-dropdown').first()
    await expect(langDropdown).toBeVisible()
  })

  test('should open language dropdown', async ({ page }) => {
    const langBtn = page.locator('.select-dropdown').first().locator('.select-value')
    await langBtn.click()
    await page.waitForTimeout(200)

    const dropdownMenu = page.locator('.select-dropdown').first().locator('.dropdown-menu')
    await expect(dropdownMenu).toBeVisible()
  })

  test('should show language options', async ({ page }) => {
    const langBtn = page.locator('.select-dropdown').first().locator('.select-value')
    await langBtn.click()
    await page.waitForTimeout(200)

    const items = page.locator('.select-dropdown').first().locator('.dropdown-item')
    expect(await items.count()).toBeGreaterThan(1)
  })
})
