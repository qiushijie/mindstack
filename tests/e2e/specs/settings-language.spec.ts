import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'
import { readConfig, writeConfig, clearSessionPaths } from '../helpers/config'
import { mockGoBinding } from '../helpers/goBindings'

async function mockConfigBindings(page: import('@playwright/test').Page) {
  await mockGoBinding(page, 'LoadConfig', () => Promise.resolve(JSON.stringify(readConfig())))
  await mockGoBinding(page, 'SaveConfig', (json: string) => {
    writeConfig(JSON.parse(json))
    return Promise.resolve('')
  })
}

test.describe('Settings Language', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockConfigBindings(page)
    await navigateTo(page, 'settings')
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => (window as any).__setLocale?.('zh'))
    const cfg = clearSessionPaths(readConfig())
    cfg.settings = cfg.settings || {}
    cfg.settings.locale = 'zh'
    writeConfig(cfg)
  })

  test('should show language dropdown', async ({ page }) => {
    await expect(page.locator('[data-testid="language-dropdown"]')).toBeVisible()
  })

  test('should open language dropdown', async ({ page }) => {
    await page.locator('[data-testid="language-dropdown"]').click()
    await expect(page.locator('[data-testid="language-option-en"]')).toBeVisible()
  })

  test('should switch language to English and persist', async ({ page }) => {
    await page.locator('[data-testid="language-dropdown"]').click()
    await page.locator('[data-testid="language-option-en"]').click()

    await expect(page.locator('[data-testid="language-dropdown"]')).toContainText('English')

    const cfg = readConfig()
    expect(cfg.settings?.locale).toBe('en')
  })
})
