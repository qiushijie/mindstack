import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openAIChatPanel, mockWailsRuntime } from '../helpers/chat'

test.describe('AI Chat Tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockWailsRuntime(page)
    await openAIChatPanel(page)
    // Wait for AIChatPanel hooks to be available
    await page.waitForFunction(() => typeof (window as any).__toggleToolMenu === 'function')
  })

  test('should open tool menu', async ({ page }) => {
    await page.evaluate(() => (window as any).__toggleToolMenu())
    await page.waitForTimeout(200)

    const menu = page.locator('.ai-chat-panel .tool-menu')
    await expect(menu).toBeVisible()
  })

  test('should show tool menu items', async ({ page }) => {
    await page.evaluate(() => (window as any).__toggleToolMenu())
    await page.waitForTimeout(200)

    const menuItems = page.locator('.ai-chat-panel .tool-menu-item')
    await expect(menuItems).toHaveCount(3)
    await expect(menuItems.nth(0)).toContainText('Search')
    await expect(menuItems.nth(1)).toContainText('Git Sync')
    await expect(menuItems.nth(2)).toContainText('Build')
  })

  test('should select search tool and update placeholder', async ({ page }) => {
    await page.evaluate(() => (window as any).__selectToolByIndex(0))
    await page.waitForTimeout(200)

    const input = page.locator('.ai-chat-panel .chat-input')
    const placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toContain('tags')
  })

  test('should select git tool and update placeholder', async ({ page }) => {
    await page.evaluate(() => (window as any).__selectToolByIndex(1))
    await page.waitForTimeout(200)

    const input = page.locator('.ai-chat-panel .chat-input')
    const placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toContain('push')
  })

  test('should close tool menu when clicking tool button again', async ({ page }) => {
    await page.evaluate(() => (window as any).__toggleToolMenu())
    await page.waitForTimeout(200)

    await expect(page.locator('.ai-chat-panel .tool-menu')).toBeVisible()

    // Click tool button to close menu
    await page.locator('.ai-chat-panel .tool-btn').click({ force: true })
    await page.waitForTimeout(200)

    await expect(page.locator('.ai-chat-panel .tool-menu')).toBeHidden()
  })

  test('should clear tool selection and reset placeholder', async ({ page }) => {
    // Select a tool
    await page.evaluate(() => (window as any).__selectToolByIndex(0))
    await page.waitForTimeout(200)

    const input = page.locator('.ai-chat-panel .chat-input')
    let placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toContain('tags')

    // Clear selection
    await page.evaluate(() => (window as any).__clearToolSelection())
    await page.waitForTimeout(200)

    placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toContain('Ask')
  })
})
