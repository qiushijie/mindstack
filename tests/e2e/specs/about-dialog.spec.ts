import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

test.describe('About Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should open about dialog', async ({ page }) => {
    await page.evaluate(() => (window as any).__showAboutDialog())
    await page.waitForTimeout(200)

    await expect(page.locator('.about-dialog-overlay')).toBeVisible()
    await expect(page.locator('.about-dialog')).toBeVisible()
  })

  test('should show app name and version', async ({ page }) => {
    await page.evaluate(() => (window as any).__showAboutDialog())
    await page.waitForTimeout(200)

    await expect(page.locator('.about-app-name')).toBeVisible()
    await expect(page.locator('.about-app-version')).toBeVisible()
  })

  test('should show description', async ({ page }) => {
    await page.evaluate(() => (window as any).__showAboutDialog())
    await page.waitForTimeout(200)

    await expect(page.locator('.about-desc')).toBeVisible()
  })

  test('should close about dialog on overlay click', async ({ page }) => {
    await page.evaluate(() => (window as any).__showAboutDialog())
    await page.waitForTimeout(200)

    await expect(page.locator('.about-dialog-overlay')).toBeVisible()

    // Click on overlay (outside dialog)
    await page.locator('.about-dialog-overlay').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(200)

    await expect(page.locator('.about-dialog-overlay')).toBeHidden()
  })

  test('should close about dialog on close button click', async ({ page }) => {
    await page.evaluate(() => (window as any).__showAboutDialog())
    await page.waitForTimeout(200)

    await expect(page.locator('.about-dialog-overlay')).toBeVisible()

    await page.locator('.about-dialog-close').click()
    await page.waitForTimeout(200)

    await expect(page.locator('.about-dialog-overlay')).toBeHidden()
  })
})
