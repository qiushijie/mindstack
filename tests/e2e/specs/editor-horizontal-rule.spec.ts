import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, clearEditor, focusEditor, setContent } from '../helpers/editor'

test.describe('Editor Horizontal Rule', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render hr widget when typing ---', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('---', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('---')

    const hr = page.locator('.cm-content .cm-hr')
    await expect(hr).toBeVisible()
  })

  test('should render hr widget when typing ***', async ({ page }) => {
    await focusEditor(page)
    await page.keyboard.type('***', { delay: 30 })

    const content = await getContent(page)
    expect(content).toContain('***')

    const hr = page.locator('.cm-content .cm-hr')
    await expect(hr).toBeVisible()
  })

  test('should render hr widget from setContent with ---', async ({ page }) => {
    await setContent(page, 'above\n\n---\n\nbelow')

    const hr = page.locator('.cm-content .cm-hr')
    await expect(hr).toBeVisible()

    const content = await getContent(page)
    expect(content).toContain('---')
    expect(content).toContain('above')
    expect(content).toContain('below')
  })

  test('should render hr widget from setContent with ***', async ({ page }) => {
    await setContent(page, 'above\n\n***\n\nbelow')

    const hr = page.locator('.cm-content .cm-hr')
    await expect(hr).toBeVisible()

    const content = await getContent(page)
    expect(content).toContain('***')
  })

  test('should render hr widget from setContent with ___', async ({ page }) => {
    await setContent(page, 'above\n\n___\n\nbelow')

    const hr = page.locator('.cm-content .cm-hr')
    await expect(hr).toBeVisible()

    const content = await getContent(page)
    expect(content).toContain('___')
  })

  test('should not render hr for single - or * without enough chars', async ({ page }) => {
    await setContent(page, '--')

    const hr = page.locator('.cm-content .cm-hr')
    await expect(hr).not.toBeVisible()
  })

  test('should render multiple hr widgets', async ({ page }) => {
    await setContent(page, '---\n\n***\n\n___')

    const hrs = page.locator('.cm-content .cm-hr')
    await expect(hrs).toHaveCount(3)
  })

  test('should preserve hr content on cursor navigation', async ({ page }) => {
    await setContent(page, 'line1\n\n---\n\nline2')
    await focusEditor(page)

    // Move cursor around
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')

    const content = await getContent(page)
    expect(content).toContain('---')
  })
})
