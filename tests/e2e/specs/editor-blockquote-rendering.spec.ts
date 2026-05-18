import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor } from '../helpers/editor'

test.describe('Blockquote Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render blockquote with cm-blockquote-line class', async ({ page }) => {
    await setContent(page, '> quote text')
    await page.waitForTimeout(200)

    const quoteLine = page.locator('.cm-line.cm-blockquote-line')
    await expect(quoteLine).toBeVisible()
  })

  test('should hide the quote mark from display', async ({ page }) => {
    await setContent(page, '> quote text')
    await page.waitForTimeout(200)

    const quoteLine = page.locator('.cm-line.cm-blockquote-line')
    const text = await quoteLine.textContent()
    // The '>' mark should be hidden
    expect(text?.trim()).toBe('quote text')
  })

  test('should render multi-line blockquote', async ({ page }) => {
    await setContent(page, '> line one\n> line two\n> line three')
    await page.waitForTimeout(200)

    const quoteLines = page.locator('.cm-line.cm-blockquote-line')
    expect(await quoteLines.count()).toBe(3)
  })

  test('should preserve quote text content', async ({ page }) => {
    await setContent(page, '> important quote')
    await page.waitForTimeout(200)

    const quoteLine = page.locator('.cm-line.cm-blockquote-line')
    await expect(quoteLine).toContainText('important quote')
  })

  test('should render nested blockquotes', async ({ page }) => {
    await setContent(page, '> outer\n> > inner')
    await page.waitForTimeout(200)

    const quoteLines = page.locator('.cm-line.cm-blockquote-line')
    expect(await quoteLines.count()).toBe(2)
  })

  test('should render blockquote with border styling', async ({ page }) => {
    await setContent(page, '> styled quote')
    await page.waitForTimeout(200)

    const quoteLine = page.locator('.cm-line.cm-blockquote-line')
    const borderLeft = await quoteLine.evaluate((el) =>
      getComputedStyle(el as HTMLElement).borderLeftWidth,
    )
    expect(borderLeft).not.toBe('0px')
  })
})
