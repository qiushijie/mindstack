import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { clearEditor, typeInEditor, setContent, getContent } from '../helpers/editor'

test.describe('Editor Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should cut selected text', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    await page.keyboard.press('End')
    await page.keyboard.up('Shift')
    await page.waitForTimeout(200)

    await page.locator('.cm-content').click({ button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    await menu.locator('[data-testid="ctx-cut"]').click()
    await page.waitForTimeout(300)

    expect(await getContent(page)).toBe('')
  })

  test('should copy selected text', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    await page.keyboard.press('End')
    await page.keyboard.up('Shift')
    await page.waitForTimeout(200)

    await page.locator('.cm-content').click({ button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    await menu.locator('[data-testid="ctx-copy"]').click()
    await page.waitForTimeout(300)

    expect(await getContent(page)).toBe('Hello')
  })

  test('should show Paste option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-paste"]')).toBeVisible()
  })

  test('should show Refresh option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-refresh"]')).toBeVisible()
  })

  test('should close context menu on Escape', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('should close context menu when clicking elsewhere', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await expect(menu).toBeHidden()
  })

  test('should show table context menu options', async ({ page }) => {
    await setContent(page, '| A | B |\n| --- | --- |\n| 1 | 2 |')
    await page.waitForTimeout(300)

    await page.locator('.cm-table-widget td').first().click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    await expect(menu.locator('[data-testid="ctx-add-row-above"]')).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-add-row-below"]')).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-delete-row"]')).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-add-column-left"]')).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-add-column-right"]')).toBeVisible()
    await expect(menu.locator('[data-testid="ctx-delete-column"]')).toBeVisible()
  })

  test('should add a table row via context menu', async ({ page }) => {
    await setContent(page, '| A | B |\n| --- | --- |\n| 1 | 2 |')
    await page.waitForTimeout(300)

    await page.locator('.cm-table-widget td').first().click({ button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    await menu.locator('[data-testid="ctx-add-row-below"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    const rows = content.split('\n').filter(line => line.startsWith('|'))
    expect(rows.length).toBe(4)
  })
})
