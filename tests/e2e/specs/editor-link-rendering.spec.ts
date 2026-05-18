import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor, getContent } from '../helpers/editor'

test.describe('Link Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render link text without showing markdown syntax', async ({ page }) => {
    await setContent(page, '[Link Text](https://example.com)')
    await page.waitForTimeout(200)

    const cmContent = page.locator('.cm-content')
    const text = await cmContent.textContent()

    // Should contain the link text
    expect(text).toContain('Link Text')
    // Should not show raw brackets and URL in visible text
    expect(text).not.toContain('[Link Text]')
  })

  test('should hide link URL from display', async ({ page }) => {
    await setContent(page, '[Text](https://example.com/path)')
    await page.waitForTimeout(200)

    const cmContent = page.locator('.cm-content')
    const text = await cmContent.textContent()

    // URL should be hidden
    expect(text).not.toContain('https://example.com')
  })

  test('should render multiple links', async ({ page }) => {
    await setContent(page, '[First](https://a.com) and [Second](https://b.com)')
    await page.waitForTimeout(200)

    const cmContent = page.locator('.cm-content')
    const text = await cmContent.textContent()

    expect(text).toContain('First')
    expect(text).toContain('Second')
  })

  test('should render link with title attribute', async ({ page }) => {
    await setContent(page, '[Text](https://example.com "Title")')
    await page.waitForTimeout(200)

    const cmContent = page.locator('.cm-content')
    const text = await cmContent.textContent()

    expect(text).toContain('Text')
    expect(text).not.toContain('"Title"')
  })

  test('should preserve link content in document source', async ({ page }) => {
    const md = '[My Link](https://example.com)'
    await setContent(page, md)

    const content = await getContent(page)
    expect(content).toContain('[My Link]')
    expect(content).toContain('https://example.com')
  })

  test('should render link in paragraph context', async ({ page }) => {
    await setContent(page, 'Visit [our site](https://example.com) for more info')
    await page.waitForTimeout(200)

    const cmContent = page.locator('.cm-content')
    const text = await cmContent.textContent()

    expect(text).toContain('Visit')
    expect(text).toContain('our site')
    expect(text).toContain('for more info')
  })
})
