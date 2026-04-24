import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import {
  clearEditor,
  typeInEditor,
  setContent,
} from '../helpers/editor'

test.describe('Editor Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await clearEditor(page)
  })

  test('should show Cut option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const cutItem = menu.locator('.ctx-item', { hasText: 'Cut' })
    await expect(cutItem).toBeVisible()
  })

  test('should show Copy option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const copyItem = menu.locator('.ctx-item', { hasText: 'Copy' })
    await expect(copyItem).toBeVisible()
  })

  test('should show Paste option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const pasteItem = menu.locator('.ctx-item', { hasText: 'Paste' })
    await expect(pasteItem).toBeVisible()
  })

  test('should show Refresh option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const refreshItem = menu.locator('.ctx-item', { hasText: 'Refresh' })
    await expect(refreshItem).toBeVisible()
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

    const addRowAbove = menu.locator('.ctx-item', { hasText: /Add Row Above/i })
    const addRowBelow = menu.locator('.ctx-item', { hasText: /Add Row Below/i })
    const deleteRow = menu.locator('.ctx-item', { hasText: /Delete Row/i })
    const addColLeft = menu.locator('.ctx-item', { hasText: /Add Column Left/i })
    const addColRight = menu.locator('.ctx-item', { hasText: /Add Column Right/i })
    const deleteCol = menu.locator('.ctx-item', { hasText: /Delete Column/i })

    await expect(addRowAbove.or(addRowBelow).or(deleteRow).first()).toBeVisible()
    await expect(addColLeft.or(addColRight).or(deleteCol).first()).toBeVisible()
  })
})
