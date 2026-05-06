import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getStatusText, setContent, focusEditor, typeInEditor } from '../helpers/editor'

test.describe('Raw Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    // Ensure raw mode is off at start
    await page.evaluate(() => (window as any).__setRawMode?.(false))
    await page.waitForTimeout(100)
  })

  test('should show Raw in status bar when toggled on and Markdown when off', async ({ page }) => {
    // Default: status bar shows "Markdown"
    let statusTexts = await getStatusText(page)
    expect(statusTexts[0]).toBe('Markdown')

    // Toggle raw mode on
    await page.evaluate(() => (window as any).__setRawMode?.(true))
    await page.waitForTimeout(200)

    statusTexts = await getStatusText(page)
    expect(statusTexts[0]).toBe('Raw')

    // Toggle raw mode off
    await page.evaluate(() => (window as any).__setRawMode?.(false))
    await page.waitForTimeout(200)

    statusTexts = await getStatusText(page)
    expect(statusTexts[0]).toBe('Markdown')
  })

  test('should show raw markdown syntax instead of rendered widgets', async ({ page }) => {
    // Toggle raw mode on
    await page.evaluate(() => (window as any).__setRawMode?.(true))
    await page.waitForTimeout(200)

    // Type markdown that would normally be rendered as widgets
    await setContent(page, '# Heading\n\n- List item\n\n**Bold text**')
    await focusEditor(page)
    await page.waitForTimeout(200)

    // In raw mode, the source syntax should be visible in the DOM
    const cmContent = page.locator('.cm-content')
    await expect(cmContent).toContainText('# Heading')
    await expect(cmContent).toContainText('- List item')
    await expect(cmContent).toContainText('**Bold text**')
  })

  test('should not show selection toolbar in raw mode', async ({ page }) => {
    await page.evaluate(() => (window as any).__setRawMode?.(true))
    await page.waitForTimeout(200)

    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Select text
    const cmContent = page.locator('.cm-content')
    const box = await cmContent.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 30, box.y + 25)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + 25, { steps: 5 })
      await page.mouse.up()
    }
    await page.waitForTimeout(300)

    // Selection toolbar should not be visible
    const toolbar = page.locator('.selection-toolbar')
    await expect(toolbar).not.toBeVisible()
  })

  test('should not show context menu in raw mode', async ({ page }) => {
    await page.evaluate(() => (window as any).__setRawMode?.(true))
    await page.waitForTimeout(200)

    await setContent(page, 'Hello World')
    await focusEditor(page)

    // Right-click on editor
    const cmContent = page.locator('.cm-content')
    const box = await cmContent.boundingBox()
    if (box) {
      await page.mouse.click(box.x + 30, box.y + 25, { button: 'right' })
    }
    await page.waitForTimeout(300)

    // Context menu should not be visible
    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).not.toBeVisible()
  })
})
