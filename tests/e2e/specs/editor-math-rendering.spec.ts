import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor, getContent } from '../helpers/editor'

test.describe('Math Formula Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render inline math with cm-math-inline class', async ({ page }) => {
    await setContent(page, 'The formula $E = mc^2$ is famous')
    await page.waitForTimeout(300)

    const mathInline = page.locator('.cm-math-inline')
    await expect(mathInline).toBeVisible()
  })

  test('should render block math with cm-math-block class', async ({ page }) => {
    await setContent(page, '$$\nE = mc^2\n$$')
    await page.waitForTimeout(300)

    const mathBlock = page.locator('.cm-math-block')
    await expect(mathBlock).toBeVisible()
  })

  test('should render KaTeX HTML inside inline math', async ({ page }) => {
    await setContent(page, '$x^2 + y^2 = z^2$')
    await page.waitForTimeout(500)

    const mathInline = page.locator('.cm-math-inline')
    await expect(mathInline).toBeVisible()

    // KaTeX renders with .katex class elements
    const katexElements = mathInline.locator('.katex')
    expect(await katexElements.count()).toBeGreaterThan(0)
  })

  test('should render KaTeX HTML inside block math', async ({ page }) => {
    await setContent(page, '$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$')
    await page.waitForTimeout(500)

    const mathBlock = page.locator('.cm-math-block')
    await expect(mathBlock).toBeVisible()

    const katexElements = mathBlock.locator('.katex')
    expect(await katexElements.count()).toBeGreaterThan(0)
  })

  test('should hide math source syntax when rendered', async ({ page }) => {
    await setContent(page, 'Text $x$ more')
    await page.waitForTimeout(300)

    // The raw $x$ should be replaced by widget
    const mathInline = page.locator('.cm-math-inline')
    await expect(mathInline).toBeVisible()
  })

  test('should hide block math when cursor enters the range', async ({ page }) => {
    await setContent(page, '$$\nx + y\n$$')
    await page.waitForTimeout(300)

    // Initially visible
    await expect(page.locator('.cm-math-block')).toBeVisible()

    // Move cursor inside the math block
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 5 } })
    })
    await page.waitForTimeout(200)

    // Math widget should disappear when cursor is inside
    await expect(page.locator('.cm-math-block')).not.toBeVisible()
  })

  test('should render multiple inline math formulas', async ({ page }) => {
    await setContent(page, '$a$ and $b$ and $c$')
    await page.waitForTimeout(300)

    const mathInlines = page.locator('.cm-math-inline')
    expect(await mathInlines.count()).toBe(3)
  })

  test('should handle invalid math gracefully', async ({ page }) => {
    await setContent(page, '$\\invalid$')
    await page.waitForTimeout(500)

    // Should still render the widget, possibly with error class
    const mathInline = page.locator('.cm-math-inline')
    await expect(mathInline).toBeVisible()
  })

  test('should not render inline math if $ is followed by space', async ({ page }) => {
    await setContent(page, 'Price is $ 100')
    await page.waitForTimeout(300)

    // This should NOT be treated as math
    const mathInlines = page.locator('.cm-math-inline')
    expect(await mathInlines.count()).toBe(0)
  })
})
