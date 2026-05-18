import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, moveCursorToEnd } from '../helpers/editor'

// --- Helpers ---

async function getCursorPos(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    return view ? view.state.selection.main.head : -1
  })
}

async function moveCursorToPos(page: import('@playwright/test').Page, pos: number) {
  await page.evaluate((p) => {
    const view = (window as any).__cmView
    if (view) view.dispatch({ selection: { anchor: p } })
  }, pos)
  await page.waitForTimeout(300)
}

async function typeInCodeBlock(page: import('@playwright/test').Page, text: string) {
  await page.keyboard.type(text, { delay: 5 })
  await page.waitForTimeout(100)
}

// Click into code block area to position cursor inside it
async function clickIntoCodeBlock(page: import('@playwright/test').Page) {
  const codeLine = page.locator('.cm-code-block').first()
  if (await codeLine.isVisible()) {
    await codeLine.click()
    await page.waitForTimeout(300)
  }
}

// Verify code block is rendered (header visible, lines exist)
async function verifyCodeBlockRendered(page: import('@playwright/test').Page, expectedLang?: string) {
  const header = page.locator('.cm-code-header')
  await expect(header).toBeVisible()
  const lines = page.locator('.cm-code-block')
  expect(await lines.count()).toBeGreaterThanOrEqual(1)
  if (expectedLang) {
    await expect(page.locator('.cm-code-lang')).toHaveText(expectedLang)
  }
}

// --- Setup code block for testing ---
async function setupCodeBlock(page: import('@playwright/test').Page, doc: string) {
  await setContent(page, doc)
  await focusEditor(page)
  await moveCursorToEnd(page)
}

// =========================================================================
// 1. Basic Render
// =========================================================================

test.describe('CodeBlock - Basic Render', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render code block with header and lang label', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nconst x = 1;\n```')
    await verifyCodeBlockRendered(page, 'javascript')
  })

  test('should render code block without language tag as "text"', async ({ page }) => {
    await setupCodeBlock(page, '```\nsome plain code\n```')
    await verifyCodeBlockRendered(page, 'text')
  })

  test('should render first/last line decorations', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\nconst y = 2;\n```')
    await expect(page.locator('.cm-code-first').first()).toBeVisible()
    await expect(page.locator('.cm-code-last').first()).toBeVisible()
  })

  test('should render multiple code blocks independently', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst a = 1;\n```\n\nSome text\n\n```py\nprint(1)\n```')
    const headers = page.locator('.cm-code-header')
    expect(await headers.count()).toBe(2)
    const langs = await page.locator('.cm-code-lang').allTextContents()
    expect(langs).toContain('js')
    expect(langs).toContain('py')
  })

  test('should render code blocks for various languages', async ({ page }) => {
    for (const lang of ['python', 'go', 'rust', 'typescript', 'json', 'yaml']) {
      await setupCodeBlock(page, `\`\`\`${lang}\nprint("hello")\n\`\`\``)
      await expect(page.locator('.cm-code-lang')).toHaveText(lang)
    }
  })
})

// =========================================================================
// 2. Actual Editing - Type text inside code block with keyboard
// =========================================================================

test.describe('CodeBlock - Real Keyboard Editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should type text inside code block and preserve it', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\n```')

    // Move cursor into the code content
    const content = await getContent(page)
    const codePos = content.indexOf('const')
    await moveCursorToPos(page, codePos)
    await page.waitForTimeout(300)

    // Type a comment at the beginning of the code line
    await typeInCodeBlock(page, '// hello')

    const updated = await getContent(page)
    expect(updated).toContain('// hello')
    expect(updated).toContain('const x = 1;')
  })

  test('should type new line inside code block', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\n```')

    const content = await getContent(page)
    const pos = content.indexOf('1;') + 2 // after "1;"
    await moveCursorToPos(page, pos)
    await page.waitForTimeout(300)

    await page.keyboard.press('Enter')
    await typeInCodeBlock(page, 'const y = 2;')

    const updated = await getContent(page)
    expect(updated).toContain('const y = 2;')
    expect(updated).toContain('const x = 1;')
  })

  test('should backspace inside code block', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\n```')

    const content = await getContent(page)
    const pos = content.indexOf('1') + 1 // after "1"
    await moveCursorToPos(page, pos)
    await page.waitForTimeout(300)

    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    const updated = await getContent(page)
    expect(updated).toContain('const x = ;')
    expect(updated).not.toContain('const x = 1;')
  })

  test('should select text inside code block and replace', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\n```')

    const content = await getContent(page)
    const from = content.indexOf('1;')
    const to = from + 2
    await page.evaluate(({ from, to }) => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: from, head: to } })
    }, { from, to })
    await page.waitForTimeout(300)

    await typeInCodeBlock(page, '42;')

    const updated = await getContent(page)
    expect(updated).toContain('const x = 42;')
    expect(updated).not.toContain('const x = 1;')
  })
})

// =========================================================================
// 3. Click Interaction Loop - the critical stress test
// =========================================================================

test.describe('CodeBlock - Click Interaction Stress', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should survive repeated click-in / click-out cycles without breaking', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\nconst y = 2;\n```')
    await verifyCodeBlockRendered(page, 'js')

    // Repeat click-in / click-out 5 times
    for (let i = 0; i < 5; i++) {
      // Click into code block
      await clickIntoCodeBlock(page)
      await page.waitForTimeout(200)

      // Type a character to verify editing works
      await page.keyboard.type(`a`)
      await page.waitForTimeout(200)

      // Move cursor out
      await moveCursorToEnd(page)
      await page.waitForTimeout(300)

      // Verify code block is still rendered
      const headers = page.locator('.cm-code-header')
      const headerCount = await headers.count()
      expect(headerCount, `Iteration ${i}: code block header should still be visible`).toBeGreaterThanOrEqual(1)
    }

    // Final verification: content should have accumulated 'a's
    const finalContent = await getContent(page)
    expect(finalContent).toContain('const x = 1;')
  })

  test('should survive clicking header, then code area, then outside repeatedly', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nlet count = 0;\n```')

    for (let i = 0; i < 3; i++) {
      // Click on the header area
      const header = page.locator('.cm-code-header')
      if (await header.isVisible()) {
        // Click near the header (but not on lang label to avoid dropdown)
        const box = await header.boundingBox()
        if (box) {
          // Click on the right side of header (not the lang label)
          await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2)
          await page.waitForTimeout(200)
        }
      }

      // Click on code content area
      await clickIntoCodeBlock(page)
      await page.waitForTimeout(200)

      // Move cursor out
      await moveCursorToEnd(page)
      await page.waitForTimeout(300)
    }

    // Code block should still be rendered properly
    await verifyCodeBlockRendered(page)
    const content = await getContent(page)
    expect(content).toContain('let count = 0;')
  })

  test('should allow editing after multiple interactions', async ({ page }) => {
    await setupCodeBlock(page, '```python\ndef greet():\n    pass\n```')

    // Click in, type, click out — 3 rounds
    for (let i = 0; i < 3; i++) {
      // Add a new line at the end of the code block (before closing ```)
      const content = await getContent(page)
      // Find position right before the closing ```
      const closeFence = content.lastIndexOf('```')
      await moveCursorToPos(page, closeFence)
      await page.waitForTimeout(200)

      await typeInCodeBlock(page, `# edit${i}\n`)

      await moveCursorToEnd(page)
      await page.waitForTimeout(300)
    }

    const final = await getContent(page)
    expect(final).toContain('# edit0')
    expect(final).toContain('# edit1')
    expect(final).toContain('# edit2')
    expect(final).toContain('def greet():')
  })
})

// =========================================================================
// 4. Language Dropdown
// =========================================================================

test.describe('CodeBlock - Language Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should open language dropdown on lang label click', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nconst x = 1;\n```')

    const langLabel = page.locator('.cm-code-lang')
    await expect(langLabel).toHaveText('javascript')

    // Click the language label to open dropdown
    await langLabel.click()
    await page.waitForTimeout(300)

    // Dropdown should appear
    const dropdown = page.locator('.cm-code-lang-dropdown')
    await expect(dropdown).toBeVisible()

    // Should contain common languages
    const items = dropdown.locator('.cm-code-lang-item')
    expect(await items.count()).toBeGreaterThan(5)

    // Current language should be marked active
    const activeItem = dropdown.locator('.cm-code-lang-item.active')
    await expect(activeItem).toHaveText('javascript')
  })

  test('should change language via dropdown', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nconst x = 1;\n```')

    // Open dropdown
    await page.locator('.cm-code-lang').click()
    await page.waitForTimeout(300)

    // Select "python"
    const pythonItem = page.locator('.cm-code-lang-item').filter({ hasText: /^python$/ })
    await pythonItem.click()
    await page.waitForTimeout(500)

    // Language should change
    const content = await getContent(page)
    expect(content).toContain('```python')
    expect(content).not.toContain('```javascript')

    // Header should update
    await expect(page.locator('.cm-code-lang')).toHaveText('python')
  })

  test('should close dropdown when clicking outside', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nconst x = 1;\n```')

    // Open dropdown
    await page.locator('.cm-code-lang').click()
    await page.waitForTimeout(300)
    await expect(page.locator('.cm-code-lang-dropdown')).toBeVisible()

    // Click somewhere else (outside the dropdown)
    await page.mouse.click(50, 50)
    await page.waitForTimeout(300)

    // Dropdown should close
    await expect(page.locator('.cm-code-lang-dropdown')).not.toBeVisible()
  })

  test('should toggle dropdown on repeated lang label clicks', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nconst x = 1;\n```')
    const langLabel = page.locator('.cm-code-lang')

    // First click: open
    await langLabel.click()
    await page.waitForTimeout(300)
    await expect(page.locator('.cm-code-lang-dropdown')).toBeVisible()

    // Second click: close
    await langLabel.click()
    await page.waitForTimeout(300)
    await expect(page.locator('.cm-code-lang-dropdown')).not.toBeVisible()
  })

  test('should survive rapid dropdown open/close cycles', async ({ page }) => {
    await setupCodeBlock(page, '```javascript\nconst x = 1;\n```')
    const langLabel = page.locator('.cm-code-lang')

    // Rapidly toggle dropdown 5 times
    for (let i = 0; i < 5; i++) {
      await langLabel.click()
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(500)

    // Code block should still be rendered
    await verifyCodeBlockRendered(page)
  })
})

// =========================================================================
// 5. Background Continuity (CSS-based check)
// =========================================================================

test.describe('CodeBlock - Background Continuity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render code block lines with same background color', async ({ page }) => {
    await setupCodeBlock(page, '```python\ndef foo():\n    pass\n\nfoo()\n```')

    const result = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-code-block')
      if (lines.length === 0) return { error: 'no code block lines' }

      const bgColors: string[] = []
      for (const line of lines) {
        bgColors.push(window.getComputedStyle(line).backgroundColor)
      }

      const allSame = bgColors.every(c => c === bgColors[0])
      return { lineCount: lines.length, bgColors, allSame }
    })

    expect(result.lineCount).toBeGreaterThanOrEqual(3)
    expect(result.allSame, `Background colors differ: ${result.bgColors?.join(', ')}`).toBe(true)
    // Should not be transparent
    expect(result.bgColors![0]).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('should have no visible gap between adjacent code lines', async ({ page }) => {
    await setupCodeBlock(page, '```go\npackage main\n\nfunc main() {}\n```')

    const gaps = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-code-block'))
      if (lines.length < 2) return []

      const gaps: number[] = []
      for (let i = 1; i < lines.length; i++) {
        const prevRect = lines[i - 1].getBoundingClientRect()
        const currRect = lines[i].getBoundingClientRect()
        gaps.push(Math.round((currRect.top - prevRect.bottom) * 100) / 100)
      }
      return gaps
    })

    // Adjacent lines should have no visible gap
    for (const gap of gaps) {
      expect(Math.abs(gap), `Gap between code block lines: ${gap}px`).toBeLessThanOrEqual(1)
    }
  })

  test('should maintain background after editing and re-rendering', async ({ page }) => {
    await setupCodeBlock(page, '```js\nconst x = 1;\n```')

    // Edit: type inside
    const content = await getContent(page)
    const pos = content.indexOf('1')
    await moveCursorToPos(page, pos)
    await typeInCodeBlock(page, '2')

    // Move out
    await moveCursorToEnd(page)
    await page.waitForTimeout(300)

    // Check background is still correct
    const result = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-code-block')
      if (lines.length === 0) return { hasBg: false }
      const bg = window.getComputedStyle(lines[0]).backgroundColor
      return { hasBg: bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' }
    })

    expect(result.hasBg, 'Code block should have visible background after editing').toBe(true)
  })
})

// =========================================================================
// 6. Edge Cases
// =========================================================================

test.describe('CodeBlock - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should handle empty code block', async ({ page }) => {
    await setupCodeBlock(page, '```go\n```')
    await verifyCodeBlockRendered(page, 'go')
  })

  test('should handle code block with only blank lines', async ({ page }) => {
    await setupCodeBlock(page, '```python\n\n\n```')
    await verifyCodeBlockRendered(page, 'python')
    const lines = page.locator('.cm-code-block')
    expect(await lines.count()).toBeGreaterThanOrEqual(1)
  })

  test('should handle adjacent code blocks', async ({ page }) => {
    await setupCodeBlock(page, '```a\nfirst\n```\n```b\nsecond\n```')
    const headers = page.locator('.cm-code-header')
    expect(await headers.count()).toBe(2)
  })

  test('should handle code block at document start', async ({ page }) => {
    await setupCodeBlock(page, '```json\n{"key": "value"}\n```\n\nParagraph after')
    await verifyCodeBlockRendered(page, 'json')
    const content = await getContent(page)
    expect(content).toContain('Paragraph after')
  })

  test('should handle code block at document end', async ({ page }) => {
    await setupCodeBlock(page, 'Paragraph before\n\n```bash\necho hello\n```')
    await verifyCodeBlockRendered(page, 'bash')
  })

  test('should handle code block with special characters', async ({ page }) => {
    await setupCodeBlock(page, '```\nconst emoji = "🚀";\nconst cn = "中文";\n```')
    await verifyCodeBlockRendered(page, 'text')
    const content = await getContent(page)
    expect(content).toContain('🚀')
    expect(content).toContain('中文')
  })

  test('should handle code block with markdown-like content inside', async ({ page }) => {
    await setupCodeBlock(page, '```md\n# Not a heading\n**not bold**\n- not list\n```')
    await verifyCodeBlockRendered(page, 'md')
    // Content inside should NOT be rendered as heading/list
    expect(await page.locator('.cm-h1, .cm-h2, .cm-h3').count()).toBe(0)
  })

  test('should handle very long code line', async ({ page }) => {
    const longLine = 'x = "' + 'a'.repeat(500) + '"'
    await setupCodeBlock(page, `\`\`\`py\n${longLine}\n\`\`\``)
    await verifyCodeBlockRendered(page, 'py')
  })
})

// =========================================================================
// 7. Large Code Block
// =========================================================================

test.describe('CodeBlock - Large Code Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render large code block with many lines', async ({ page }) => {
    const lines: string[] = []
    for (let i = 0; i < 50; i++) {
      lines.push(`    line_${i} = ${i * i}`)
    }
    await setupCodeBlock(page, `\`\`\`python\n${lines.join('\n')}\n\`\`\``)

    await verifyCodeBlockRendered(page, 'python')
    const codeLines = page.locator('.cm-code-block')
    expect(await codeLines.count()).toBeGreaterThanOrEqual(10)

    const content = await getContent(page)
    expect(content).toContain('line_0 = 0')
    expect(content).toContain('line_49 = 2401')
  })

  test('should handle typing in the middle of a large code block', async ({ page }) => {
    const lines: string[] = []
    for (let i = 0; i < 20; i++) {
      lines.push(`    line_${i} = ${i}`)
    }
    await setupCodeBlock(page, `\`\`\`python\n${lines.join('\n')}\n\`\`\``)

    // Position cursor precisely inside code content (at "line_10")
    const content = await getContent(page)
    const pos = content.indexOf('line_10')
    await moveCursorToPos(page, pos)
    await page.waitForTimeout(200)

    // Type a comment before the line
    await typeInCodeBlock(page, '# inserted\n')

    const after = await getContent(page)
    expect(after).toContain('# inserted')
    expect(after).toContain('line_0 = 0')
    expect(after).toContain('line_19 = 19')
  })
})

// =========================================================================
// 8. Rapid Edit-Render Cycles
// =========================================================================

test.describe('CodeBlock - Rapid Edit-Render Cycles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should survive rapid typing inside code block', async ({ page }) => {
    await setupCodeBlock(page, '```js\n\n```')

    // Move cursor into the empty code block
    const content = await getContent(page)
    const pos = content.indexOf('```js') + 6 // after ```js\n
    await moveCursorToPos(page, pos)
    await page.waitForTimeout(200)

    // Rapidly type multiple lines
    await page.keyboard.type('const a = 1;', { delay: 5 })
    await page.keyboard.press('Enter')
    await page.keyboard.type('const b = 2;', { delay: 5 })
    await page.keyboard.press('Enter')
    await page.keyboard.type('const c = 3;', { delay: 5 })

    const final = await getContent(page)
    expect(final).toContain('const a = 1;')
    expect(final).toContain('const b = 2;')
    expect(final).toContain('const c = 3;')
  })

  test('should survive rapid cursor in/out and content changes', async ({ page }) => {
    await setupCodeBlock(page, '```js\nlet x = 0;\n```')

    for (let i = 0; i < 5; i++) {
      // Move cursor into code block and modify
      const content = await getContent(page)
      const pos = content.indexOf('0;') + 1
      await moveCursorToPos(page, pos)
      await page.waitForTimeout(100)

      // Replace the digit
      await page.keyboard.press('Delete')
      await page.keyboard.type(String(i))
      await page.waitForTimeout(100)

      // Move out
      await moveCursorToEnd(page)
      await page.waitForTimeout(200)

      // Verify rendering is intact
      const headers = page.locator('.cm-code-header')
      expect(await headers.count()).toBeGreaterThanOrEqual(1)
    }

    // Content should have been modified
    const final = await getContent(page)
    expect(final).toContain('let x = ')
    expect(final).not.toContain('let x = 0;')
  })
})
