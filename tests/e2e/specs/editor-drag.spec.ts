import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

test.describe('Editor Drag Sort', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await clearEditor(page)
  })

  test('should show drag handles in gutter', async ({ page }) => {
    await setContent(page, '# First\n\nParagraph\n\n# Second')
    await focusEditor(page)

    const gutter = page.locator('.cm-gutters')
    await gutter.hover()
    await page.waitForTimeout(300)

    const handles = page.locator('.cm-block-drag')
    await expect(handles.first()).toBeVisible({ timeout: 5000 })
    const count = await handles.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('should reorder blocks by dragging', async ({ page }) => {
    await setContent(page, '# First\n\n# Second')
    await focusEditor(page)

    // Make drag handles visible by hovering gutter
    const gutter = page.locator('.cm-gutters')
    await gutter.hover()
    await page.waitForTimeout(300)

    const handles = page.locator('.cm-block-drag')
    await expect(handles.first()).toBeVisible({ timeout: 5000 })

    const firstHandle = handles.first()
    const handleBox = await firstHandle.boundingBox()

    // Get the second block's line position in content area
    const lines = page.locator('.cm-line')
    const secondLine = lines.nth(2) // line 3: # Second
    const secondLineBox = await secondLine.boundingBox()

    if (handleBox && secondLineBox) {
      // 1. Mousedown on drag handle (gutter) to start drag
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(100)

      // 2. Move to content area at bottom of second line (not gutter!)
      //    posAtCoords requires coordinates inside the content DOM
      await page.mouse.move(
        secondLineBox.x + secondLineBox.width / 2,
        secondLineBox.y + secondLineBox.height * 0.75,
        { steps: 10 },
      )
      await page.waitForTimeout(100)

      // 3. Release to drop
      await page.mouse.up()
      await page.waitForTimeout(500)

      const content = await getContent(page)
      expect(content.indexOf('# Second')).toBeLessThan(content.indexOf('# First'))
    }
  })
})
