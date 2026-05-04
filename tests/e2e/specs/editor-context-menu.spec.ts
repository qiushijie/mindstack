import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import {
  clearEditor,
  typeInEditor,
  setContent,
} from '../helpers/editor'

test.describe('Editor Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should show Cut option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const cutItem = menu.locator('.ctx-item', { hasText: '剪切' })
    await expect(cutItem).toBeVisible()
  })

  test('should show Copy option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const copyItem = menu.locator('.ctx-item', { hasText: '复制' })
    await expect(copyItem).toBeVisible()
  })

  test('should show Paste option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const pasteItem = menu.locator('.ctx-item', { hasText: '粘贴' })
    await expect(pasteItem).toBeVisible()
  })

  test('should show Refresh option', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.locator('.cm-content').click({ button: 'right' })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()

    const refreshItem = menu.locator('.ctx-item', { hasText: '刷新' })
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

    const addRowAbove = menu.locator('.ctx-item', { hasText: '在上方插入行' })
    const addRowBelow = menu.locator('.ctx-item', { hasText: '在下方插入行' })
    const deleteRow = menu.locator('.ctx-item', { hasText: '删除行' })
    const addColLeft = menu.locator('.ctx-item', { hasText: '在左侧插入列' })
    const addColRight = menu.locator('.ctx-item', { hasText: '在右侧插入列' })
    const deleteCol = menu.locator('.ctx-item', { hasText: '删除列' })

    await expect(addRowAbove.or(addRowBelow).or(deleteRow).first()).toBeVisible()
    await expect(addColLeft.or(addColRight).or(deleteCol).first()).toBeVisible()
  })
})
