import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor } from '../helpers/editor'

const JS_CODE_BLOCK = `\
\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`
}
\`\`\``

const PYTHON_CODE_BLOCK = `\
\`\`\`python
def hello():
    print("hello")
\`\`\``

const NO_LANG_CODE_BLOCK = `\
\`\`\`
plain text block
\`\`\``

const GO_CODE_BLOCK = `\
\`\`\`go
func main() {
    fmt.Println("hello")
}
\`\`\``

test.describe('Editor Code Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test.describe('code block DOM structure', () => {
    test('should apply cm-code-block class to all code block lines', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-block', { timeout: 3000 })
      const lines = page.locator('.cm-line.cm-code-block')
      // 5 lines: opening fence + 3 content + closing fence
      await expect(lines).toHaveCount(5)
    })

    test('should apply cm-code-first to opening fence line', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-first', { timeout: 3000 })
      await expect(page.locator('.cm-line.cm-code-first')).toBeVisible()
    })

    test('should apply cm-code-last to closing fence line', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-last', { timeout: 3000 })
      await expect(page.locator('.cm-line.cm-code-last')).toBeVisible()
    })

    test('should apply cm-code-line to code content lines only', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })
      const codeLines = page.locator('.cm-line.cm-code-line')
      await expect(codeLines).toHaveCount(3)
      await expect(codeLines.first()).toContainText('function greet')
    })
  })

  test.describe('code header widget', () => {
    test('should display language label for JavaScript', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-lang', { timeout: 3000 })
      await expect(page.locator('.cm-code-lang')).toHaveText('js')
    })

    test('should display language label for Python', async ({ page }) => {
      await setContent(page, PYTHON_CODE_BLOCK)
      await page.waitForSelector('.cm-code-lang', { timeout: 3000 })
      await expect(page.locator('.cm-code-lang')).toHaveText('python')
    })

    test('should display language label for Go', async ({ page }) => {
      await setContent(page, GO_CODE_BLOCK)
      await page.waitForSelector('.cm-code-lang', { timeout: 3000 })
      await expect(page.locator('.cm-code-lang')).toHaveText('go')
    })

    test('should show "text" for code block without language', async ({ page }) => {
      await setContent(page, NO_LANG_CODE_BLOCK)
      await page.waitForSelector('.cm-code-lang', { timeout: 3000 })
      await expect(page.locator('.cm-code-lang')).toHaveText('text')
    })
  })

  test.describe('syntax highlighting', () => {
    test('should highlight JavaScript with token spans', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })

      // Language parsers are lazy-loaded via dynamic import().
      // Wait for the first token span to appear.
      await page.waitForSelector('.cm-line.cm-code-line span', { timeout: 5000 })

      const spanCount = await page.locator('.cm-line.cm-code-line span').count()
      expect(spanCount).toBeGreaterThan(0)
    })

    test('should produce multiple token classes for JavaScript', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })

      // Highlighted code should have spans with different classes
      // (e.g. one class for keywords, another for strings).
      await page.waitForSelector('.cm-line.cm-code-line span', { timeout: 5000 })

      const uniqueClasses = await page.evaluate(() => {
        const spans = document.querySelectorAll('.cm-line.cm-code-line span')
        const classes = new Set<string>()
        spans.forEach((s) => s.classList.forEach((c) => classes.add(c)))
        return classes.size
      })
      expect(uniqueClasses).toBeGreaterThanOrEqual(2)
    })

    test('should highlight Python with token spans', async ({ page }) => {
      await setContent(page, PYTHON_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })
      await page.waitForSelector('.cm-line.cm-code-line span', { timeout: 5000 })

      const spanCount = await page.locator('.cm-line.cm-code-line span').count()
      expect(spanCount).toBeGreaterThan(0)
    })

    test('should produce multiple token classes for Python', async ({ page }) => {
      await setContent(page, PYTHON_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })
      await page.waitForSelector('.cm-line.cm-code-line span', { timeout: 5000 })

      const uniqueClasses = await page.evaluate(() => {
        const spans = document.querySelectorAll('.cm-line.cm-code-line span')
        const classes = new Set<string>()
        spans.forEach((s) => s.classList.forEach((c) => classes.add(c)))
        return classes.size
      })
      expect(uniqueClasses).toBeGreaterThanOrEqual(2)
    })

    test('should only use base monospace class for plain text block', async ({ page }) => {
      await setContent(page, NO_LANG_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })

      // Plain text blocks get a single monospace styling span.
      // Wait for it to appear, then verify only one class is used.
      await page.waitForSelector('.cm-line.cm-code-line span', { timeout: 5000 })

      const uniqueClasses = await page.evaluate(() => {
        const spans = document.querySelectorAll('.cm-line.cm-code-line span')
        const classes = new Set<string>()
        spans.forEach((s) => s.classList.forEach((c) => classes.add(c)))
        return classes.size
      })
      // Plain text gets at most one token class (the base monospace style).
      expect(uniqueClasses).toBeLessThanOrEqual(1)
    })
  })

  test.describe('code block styling', () => {
    test('should use monospace font on code lines', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-line', { timeout: 3000 })
      const codeLine = page.locator('.cm-line.cm-code-line').first()
      const fontFamily = await codeLine.evaluate((el) => getComputedStyle(el).fontFamily)
      expect(fontFamily).toContain('mono')
    })

    test('should not have 0px border radius on first and last lines', async ({ page }) => {
      await setContent(page, JS_CODE_BLOCK)
      await page.waitForSelector('.cm-code-last', { timeout: 3000 })

      const firstLine = page.locator('.cm-line.cm-code-first')
      const firstRadius = await firstLine.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
      expect(firstRadius).not.toBe('0px')

      const lastLine = page.locator('.cm-line.cm-code-last')
      const lastRadius = await lastLine.evaluate((el) => getComputedStyle(el).borderBottomLeftRadius)
      expect(lastRadius).not.toBe('0px')
    })
  })
})
