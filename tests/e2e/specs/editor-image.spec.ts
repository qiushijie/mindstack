import path from 'path'
import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, clearEditor, focusEditor, setContent, moveCursorToEnd } from '../helpers/editor'

const FIXTURE_IMAGES = path.resolve(__dirname, '../fixtures/workspace/images')

async function positionCursorInsideImage(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const view = (window as any).__cmView
    if (view) {
      const doc = view.state.doc.toString()
      const idx = doc.indexOf('![')
      if (idx >= 0) view.dispatch({ selection: { anchor: idx + 2 } })
    }
  })
}

test.describe('Editor Image', () => {
  test.beforeEach(async ({ page }) => {
    // Mock GetFileServerPort to return a fake port so resolveImageUrl generates URLs
    await page.addInitScript(() => {
      ;(window as any).go = (window as any).go || {}
      ;(window as any).go.main = (window as any).go.main || {}
      ;(window as any).go.main.App = (window as any).go.main.App || {}
      ;(window as any).go.main.App.GetFileServerPort = () => Promise.resolve(9876)
      ;(window as any).go.main.App.SetWorkspaceRoot = () => Promise.resolve()
    })

    // Serve fixture images via route interception
    // resolveImageUrl wraps paths into http://127.0.0.1:{port}/local-file/<encoded>
    await page.route('**/local-file/**', async route => {
      const url = route.request().url()
      const encoded = url.split('/local-file/')[1]
      const decoded = decodeURIComponent(encoded)
      const filename = decoded.split('/').pop()!
      await route.fulfill({ path: path.join(FIXTURE_IMAGES, filename) })
    })

    await page.goto('/')
    await waitForAppReady(page)
    await clearEditor(page)
  })

  test('should render image widget with real image', async ({ page }) => {
    await setContent(page, '![logo](/workspace-images/0006.png)')
    await moveCursorToEnd(page)

    const container = page.locator('.cm-content .cm-image-container')
    await expect(container).toBeVisible()
    const img = container.locator('img.cm-image')
    await expect(img).toHaveAttribute('src', /\/local-file\//)
    await expect(img).toHaveAttribute('alt', 'logo')
  })

  test('should display loaded image with visible dimensions', async ({ page }) => {
    await setContent(page, '![photo](/workspace-images/0006.png)')
    await moveCursorToEnd(page)

    const img = page.locator('.cm-content .cm-image-container img.cm-image')
    await expect(img).toBeVisible()

    // Wait for image to load and have dimensions
    const loaded = await page.waitForFunction(() => {
      const img = document.querySelector('.cm-image') as HTMLImageElement
      return img && img.naturalWidth > 0
    })
    expect(await loaded.jsonValue()).toBeTruthy()
  })

  test('should render image caption for non-empty alt', async ({ page }) => {
    await setContent(page, '![My Photo](/workspace-images/0006.png)')
    await moveCursorToEnd(page)

    const caption = page.locator('.cm-content .cm-image-caption')
    await expect(caption).toBeVisible()
    await expect(caption).toHaveText('My Photo')
  })

  test('should show placeholder for empty url', async ({ page }) => {
    await setContent(page, '![alt]()')
    await moveCursorToEnd(page)

    const placeholder = page.locator('.cm-content .cm-image-placeholder')
    await expect(placeholder).toBeVisible()
    await expect(placeholder).toHaveText('alt')
  })

  test('should show placeholder for empty alt and url', async ({ page }) => {
    await setContent(page, '![]()')
    await moveCursorToEnd(page)

    const placeholder = page.locator('.cm-content .cm-image-placeholder')
    await expect(placeholder).toBeVisible()
    await expect(placeholder).toHaveText('Image')
  })

  test('should preserve image content in document', async ({ page }) => {
    await setContent(page, 'before\n\n![alt](/workspace-images/0001.png)\n\nafter')

    const content = await getContent(page)
    expect(content).toContain('![alt](/workspace-images/0001.png)')
    expect(content).toContain('before')
    expect(content).toContain('after')
  })

  test('should render multiple images', async ({ page }) => {
    await setContent(page, '![a](/workspace-images/0001.png)\n\n![b](/workspace-images/0002.png)\n\n![c](/workspace-images/0003.png)')
    await moveCursorToEnd(page)

    const containers = page.locator('.cm-content .cm-image-container')
    await expect(containers).toHaveCount(3)
  })

  test('should enter editing mode when cursor is inside image', async ({ page }) => {
    await setContent(page, 'text\n\n![logo](/workspace-images/0006.png)')
    await moveCursorToEnd(page)

    const container = page.locator('.cm-content .cm-image-container')
    await expect(container).toBeVisible()

    await positionCursorInsideImage(page)

    const editingLine = page.locator('.cm-content .cm-image-editing')
    await expect(editingLine).toBeVisible()
    await expect(container).not.toBeVisible()
  })

  test('should render image with title syntax', async ({ page }) => {
    await setContent(page, '![alt](/workspace-images/0006.png "A title")')
    await moveCursorToEnd(page)

    const container = page.locator('.cm-content .cm-image-container')
    await expect(container).toBeVisible()
    const img = container.locator('img.cm-image')
    await expect(img).toHaveAttribute('src', /\/local-file\//)
  })

  test('should render image inline with text', async ({ page }) => {
    await setContent(page, 'Hello ![icon](/workspace-images/0006.png) world')
    await moveCursorToEnd(page)

    const container = page.locator('.cm-content .cm-image-container')
    await expect(container).toBeVisible()

    const content = await getContent(page)
    expect(content).toContain('Hello ![icon](/workspace-images/0006.png) world')
  })

  test('should return to widget mode when cursor moves away', async ({ page }) => {
    await setContent(page, 'text\n\n![logo](/workspace-images/0006.png)\n\nmore')
    await moveCursorToEnd(page)

    const container = page.locator('.cm-content .cm-image-container')
    await expect(container).toBeVisible()

    await positionCursorInsideImage(page)
    await expect(container).not.toBeVisible()

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 0 } })
    })

    await expect(container).toBeVisible()
  })
})
