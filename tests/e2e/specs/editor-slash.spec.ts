import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Slash Command Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should show slash menu when typing / at line start', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/', { delay: 50 })

    const menu = await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })
    expect(menu).toBeTruthy()
    await expect(page.locator('.cm-slash-menu')).toBeVisible()
  })

  test('should show all command items', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    const items = page.locator('.cm-slash-item')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(8)
  })

  test('should filter commands when typing after /', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/hea', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    const items = page.locator('.cm-slash-item')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(1)

    for (let i = 0; i < count; i++) {
      const label = await items.nth(i).locator('.cm-slash-label').textContent()
      expect(label!).toContain('标题')
    }
  })

  test('should select command with Enter key', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page.locator('.cm-slash-menu')).not.toBeVisible()

    const content = await getContent(page)
    expect(content.length).toBeGreaterThan(0)
  })

  test('should select command with mouse click', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    const firstItem = page.locator('.cm-slash-item').first()
    await firstItem.click()

    await expect(page.locator('.cm-slash-menu')).not.toBeVisible()

    const content = await getContent(page)
    expect(content.length).toBeGreaterThan(0)
  })

  test('should close menu with Escape and remove slash text', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    await page.keyboard.press('Escape')

    await expect(page.locator('.cm-slash-menu')).not.toBeVisible()
    const content = await getContent(page)
    expect(content).toBe('')
  })

  test('should remove slash text when editor loses focus', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/code', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    // Click outside the editor to trigger blur
    await page.locator('.sidebar').click({ position: { x: 10, y: 10 } })

    await expect(page.locator('.cm-slash-menu')).not.toBeVisible()
    const content = await getContent(page)
    expect(content).toBe('')
  })

  test('should show empty message when no match', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('/xyz', { delay: 50 })
    await page.waitForSelector('.cm-slash-menu', { timeout: 3000 })

    await expect(page.locator('.cm-slash-empty')).toBeVisible()
    await expect(page.locator('.cm-slash-item')).toHaveCount(0)
  })
})
