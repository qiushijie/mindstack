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

test.describe('Settings Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockConfigBindings(page)

    const dialog = page.locator('.confirm-dialog-overlay')
    try {
      await dialog.waitFor({ state: 'visible', timeout: 3000 })
      await page.locator('.btn-cancel').click()
      await dialog.waitFor({ state: 'hidden', timeout: 3000 })
    } catch {
      // Dialog did not appear, that's fine
    }

    await navigateTo(page, 'settings')
  })

  test.afterEach(() => {
    const cfg = clearSessionPaths(readConfig())
    cfg.settings = cfg.settings || {}
    cfg.settings.theme = 'light'
    cfg.settings.locale = 'zh'
    cfg.settings.autoSave = true
    cfg.settings.autoSaveDelay = 5
    cfg.settings.autoCommit = false
    cfg.settings.lineNumbers = true
    cfg.settings.wordWrap = true
    writeConfig(cfg)
  })

  test('should show theme buttons in General section', async ({ page }) => {
    await expect(page.locator('[data-testid="theme-light-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="theme-dark-btn"]')).toBeVisible()
  })

  test('should toggle theme from Light to Dark and persist', async ({ page }) => {
    await page.locator('[data-testid="theme-dark-btn"]').click()
    await expect(page.locator('[data-testid="theme-dark-btn"]')).toHaveClass(/active/)

    await page.waitForTimeout(500)
    const cfg = readConfig()
    expect(cfg.settings?.theme).toBe('dark')
  })

  test('should toggle Auto Save on and off and persist', async ({ page }) => {
    const toggle = page.locator('[data-testid="toggle-auto-save"]')
    const cfgBefore = readConfig()
    const wasOn = !!cfgBefore.settings?.autoSave

    await toggle.click()
    await expect(toggle).toHaveClass(wasOn ? /^(?!.*on).*$/ : /on/)

    await page.waitForTimeout(500)
    const cfgAfter = readConfig()
    expect(cfgAfter.settings?.autoSave).toBe(!wasOn)
  })

  test('should toggle Line Numbers state', async ({ page }) => {
    const toggle = page.locator('[data-testid="toggle-line-numbers"]')
    const wasOn = await toggle.evaluate(el => el.classList.contains('on'))

    await toggle.click()
    await expect(toggle).toHaveClass(wasOn ? /^(?!.*on).*$/ : /on/)

    await navigateTo(page, 'editor')
    const lineNumberGutter = page.locator('.cm-lineNumbers')
    if (wasOn) {
      await expect(lineNumberGutter).toHaveCount(0)
    } else {
      await expect(lineNumberGutter).toBeVisible()
    }
  })

  test('should toggle Word Wrap state', async ({ page }) => {
    const toggle = page.locator('[data-testid="toggle-word-wrap"]')
    const wasOn = await toggle.evaluate(el => el.classList.contains('on'))

    await toggle.click()
    await expect(toggle).toHaveClass(wasOn ? /^(?!.*on).*$/ : /on/)
  })

  test('should show Auto Commit toggle in Git section', async ({ page }) => {
    await expect(page.locator('[data-testid="toggle-auto-commit"]')).toBeVisible()
  })

  test('should toggle Auto Commit and persist', async ({ page }) => {
    const toggle = page.locator('[data-testid="toggle-auto-commit"]')
    const cfgBefore = readConfig()
    const wasOn = !!cfgBefore.settings?.autoCommit

    await toggle.click()
    await expect(toggle).toHaveClass(wasOn ? /^(?!.*on).*$/ : /on/)

    await page.waitForTimeout(500)
    const cfgAfter = readConfig()
    expect(cfgAfter.settings?.autoCommit).toBe(!wasOn)
  })

  test('should show model section', async ({ page }) => {
    const titles = page.locator('.settings-content .section-title')
    await expect(titles.filter({ hasText: '模型' })).toBeVisible()
  })
})
