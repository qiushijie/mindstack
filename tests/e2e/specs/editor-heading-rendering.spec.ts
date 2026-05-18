import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Heading Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render H1 with cm-h1 class', async ({ page }) => {
    await setContent(page, '# Hello World')
    await page.waitForTimeout(200)

    const h1Line = page.locator('.cm-line.cm-h1')
    await expect(h1Line).toBeVisible()
    await expect(h1Line).toContainText('Hello World')
  })

  test('should render H2 with cm-h2 class', async ({ page }) => {
    await setContent(page, '## Hello World')
    await page.waitForTimeout(200)

    const h2Line = page.locator('.cm-line.cm-h2')
    await expect(h2Line).toBeVisible()
    await expect(h2Line).toContainText('Hello World')
  })

  test('should render H3 with cm-h3 class', async ({ page }) => {
    await setContent(page, '### Hello World')
    await page.waitForTimeout(200)

    const h3Line = page.locator('.cm-line.cm-h3')
    await expect(h3Line).toBeVisible()
    await expect(h3Line).toContainText('Hello World')
  })

  test('should render H4 with cm-h4 class', async ({ page }) => {
    await setContent(page, '#### Hello World')
    await page.waitForTimeout(200)

    const h4Line = page.locator('.cm-line.cm-h4')
    await expect(h4Line).toBeVisible()
    await expect(h4Line).toContainText('Hello World')
  })

  test('should render H5 with cm-h5 class', async ({ page }) => {
    await setContent(page, '##### Hello World')
    await page.waitForTimeout(200)

    const h5Line = page.locator('.cm-line.cm-h5')
    await expect(h5Line).toBeVisible()
    await expect(h5Line).toContainText('Hello World')
  })

  test('should render H6 with cm-h6 class', async ({ page }) => {
    await setContent(page, '###### Hello World')
    await page.waitForTimeout(200)

    const h6Line = page.locator('.cm-line.cm-h6')
    await expect(h6Line).toBeVisible()
    await expect(h6Line).toContainText('Hello World')
  })

  test('should hide the hash marks from display', async ({ page }) => {
    await setContent(page, '# Hello World')
    await page.waitForTimeout(200)

    // The raw markdown syntax should be hidden via atomic decoration
    // The line should contain the text but # mark should not be directly visible as text node
    const h1Line = page.locator('.cm-line.cm-h1')
    const text = await h1Line.textContent()
    // Text content should be just 'Hello World' (the # is hidden by Decoration.replace)
    expect(text?.trim()).toBe('Hello World')
  })

  test('should render multiple headings in one document', async ({ page }) => {
    await setContent(page, '# First\n\n## Second\n\n### Third')
    await page.waitForTimeout(200)

    await expect(page.locator('.cm-line.cm-h1')).toBeVisible()
    await expect(page.locator('.cm-line.cm-h2')).toBeVisible()
    await expect(page.locator('.cm-line.cm-h3')).toBeVisible()
  })

  test('should apply different heading font sizes via highlight spans', async ({ page }) => {
    await setContent(page, '# H1\n\n## H2')
    await page.waitForTimeout(200)

    // Heading font sizes are applied by HighlightStyle to text spans, not the line element
    const h1TextSpan = page.locator('.cm-line.cm-h1 span').filter({ hasText: 'H1' })
    const h2TextSpan = page.locator('.cm-line.cm-h2 span').filter({ hasText: 'H2' })

    const h1FontSize = await h1TextSpan.evaluate((el) => getComputedStyle(el as HTMLElement).fontSize)
    const h2FontSize = await h2TextSpan.evaluate((el) => getComputedStyle(el as HTMLElement).fontSize)

    // H1 should be larger than H2
    expect(parseFloat(h1FontSize)).toBeGreaterThan(parseFloat(h2FontSize))
  })
})
