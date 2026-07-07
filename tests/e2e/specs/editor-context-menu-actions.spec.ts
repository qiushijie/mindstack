import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { clearEditor, typeInEditor, getContent, getCoordsAtPos } from '../helpers/editor'

test.describe('Editor Context Menu Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
    await page.evaluate(() => (window as any).__clearMockClipboard?.())
  })

  async function selectFirstWord(page: import('@playwright/test').Page) {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.up('Shift')
    await page.waitForTimeout(300)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return null
      const range = view.state.selection.main
      return { from: range.from, to: range.to, empty: range.empty }
    })
    expect(sel).not.toBeNull()
    expect(sel!.empty).toBe(false)
  }

  async function openContextMenuAtSelection(page: import('@playwright/test').Page) {
    const cmContent = page.locator('.cm-content')
    const box = await cmContent.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + 25, box!.y + 25, { button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    return menu
  }

  async function openContextMenuAtPos(page: import('@playwright/test').Page, pos: number) {
    const coords = await getCoordsAtPos(page, pos)
    expect(coords).toBeTruthy()
    await page.mouse.click(coords!.x, coords!.y, { button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    return menu
  }

  test('should cut selected text', async ({ page }) => {
    await selectFirstWord(page)
    const menu = await openContextMenuAtSelection(page)

    await menu.locator('[data-testid="ctx-cut"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe(' World')
  })

  test('should copy selected text', async ({ page }) => {
    await selectFirstWord(page)
    const menu = await openContextMenuAtSelection(page)

    await menu.locator('[data-testid="ctx-copy"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should not cut when no text is selected', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    await page.waitForTimeout(200)

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('[data-testid="ctx-cut"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should not copy when no text is selected', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    await page.waitForTimeout(200)

    const menu = await openContextMenuAtSelection(page)

    await menu.locator('[data-testid="ctx-copy"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('should paste text from mock clipboard', async ({ page }) => {
    await typeInEditor(page, 'Hello World')
    await page.keyboard.press('Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)

    await page.evaluate(() => (window as any).__setMockClipboard('Inserted'))

    const menu = await openContextMenuAtPos(page, 5)
    await menu.locator('[data-testid="ctx-paste"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('HelloInserted World')
  })

  test('should paste text replacing selection', async ({ page }) => {
    await selectFirstWord(page)

    await page.evaluate(() => (window as any).__setMockClipboard('Hi'))

    const menu = await openContextMenuAtSelection(page)
    await menu.locator('[data-testid="ctx-paste"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('Hi World')
  })

  test('should paste at end of document', async ({ page }) => {
    await typeInEditor(page, 'Hello')
    await page.keyboard.press('End')
    await page.waitForTimeout(200)

    await page.evaluate(() => (window as any).__setMockClipboard(' World'))

    const menu = await openContextMenuAtPos(page, 5)
    await menu.locator('[data-testid="ctx-paste"]').click()
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })
})
