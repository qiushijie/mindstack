import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

/**
 * Generate a document with many large code blocks (20 lines each) that
 * will definitely span the viewport when partially scrolled past.
 */
function generateScrollDocument(sections: number): string {
  const parts: string[] = []
  for (let i = 0; i < sections; i++) {
    parts.push(`## Section ${i}`)
    parts.push('')
    parts.push('```python')
    parts.push(`# code block ${i}`)
    for (let j = 0; j < 20; j++) {
      parts.push(`def func_${i}_${j}(): return ${i * 100 + j}`)
    }
    parts.push('```')
    parts.push('')
    for (let j = 0; j < 5; j++) {
      parts.push(`> Blockquote section ${i} line ${j} with enough text to fill.`)
    }
    parts.push('')
  }
  return parts.join('\n')
}

/**
 * Get code-content lines that are within the CodeMirror viewport.
 * Uses view.posAtDOM() to determine each line's document position and
 * filters to only those within [viewport.from, viewport.to).
 */
async function getCodeLinesInViewport(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    if (!view) return []
    const vpFrom = view.viewport.from
    const vpTo = view.viewport.to

    const result: Array<{ text: string; classes: string[]; hasCodeBlock: boolean }> = []
    for (const line of document.querySelectorAll('.cm-line')) {
      const text = (line.textContent ?? '').trim()
      if (!text.startsWith('def func_') && !text.startsWith('# code block')) continue
      try {
        const pos = view.posAtDOM(line)
        if (pos < vpFrom || pos > vpTo) continue
      } catch { continue }
      result.push({
        text: text.substring(0, 60),
        classes: Array.from(line.classList),
        hasCodeBlock: line.classList.contains('cm-code-block'),
      })
    }
    return result
  })
}

/**
 * Get blockquote lines within the CodeMirror viewport.
 */
async function getBlockquoteLinesInViewport(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    if (!view) return []
    const vpFrom = view.viewport.from
    const vpTo = view.viewport.to

    const result: Array<{ text: string; hasBlockquote: boolean }> = []
    for (const line of document.querySelectorAll('.cm-line')) {
      const text = (line.textContent ?? '').trim()
      if (!text.startsWith('Blockquote section')) continue
      try {
        const pos = view.posAtDOM(line)
        if (pos < vpFrom || pos > vpTo) continue
      } catch { continue }
      result.push({
        text: text.substring(0, 60),
        hasBlockquote: line.classList.contains('cm-blockquote-line'),
      })
    }
    return result
  })
}

/**
 * Get heading lines within the CodeMirror viewport.
 */
async function getHeadingLinesInViewport(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    if (!view) return []
    const vpFrom = view.viewport.from
    const vpTo = view.viewport.to

    const result: Array<{ text: string; hasHeading: boolean }> = []
    for (const line of document.querySelectorAll('.cm-line')) {
      const text = (line.textContent ?? '').trim()
      if (!text.startsWith('Heading ')) continue
      try {
        const pos = view.posAtDOM(line)
        if (pos < vpFrom || pos > vpTo) continue
      } catch { continue }
      result.push({
        text,
        hasHeading: Array.from(line.classList).some(c => c.startsWith('cm-h')),
      })
    }
    return result
  })
}

async function scrollToFraction(page: import('@playwright/test').Page, fraction: number) {
  await page.evaluate((f) => {
    const scroller = document.querySelector('.cm-scroller')
    if (scroller) scroller.scrollTop = scroller.scrollHeight * f
  }, fraction)
}

async function rapidWheelScroll(page: import('@playwright/test').Page, { down = true, steps = 20, delta = 300, interval = 30 }) {
  const direction = down ? 1 : -1
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta * direction)
    if (i < steps - 1) await page.waitForTimeout(interval)
  }
}

test.describe('Scroll Rendering - Code Blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('code block lines styled after scrolling past block start (30%)', async ({ page }) => {
    const doc = generateScrollDocument(30)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.3)
    await page.waitForTimeout(500)

    const lines = await getCodeLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])
  })

  test('code block lines styled after scrolling to 50%', async ({ page }) => {
    const doc = generateScrollDocument(30)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.5)
    await page.waitForTimeout(500)

    const lines = await getCodeLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])
  })

  test('code block lines styled after scrolling to 70%', async ({ page }) => {
    const doc = generateScrollDocument(30)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.7)
    await page.waitForTimeout(500)

    const lines = await getCodeLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])
  })

  test('code block lines styled after rapid mouse wheel scroll down', async ({ page }) => {
    const doc = generateScrollDocument(40)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await rapidWheelScroll(page, { down: true, steps: 30, delta: 400, interval: 20 })
    await page.waitForTimeout(800)

    const lines = await getCodeLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])
  })

  test('code block lines styled after rapid alternating scroll up/down', async ({ page }) => {
    const doc = generateScrollDocument(40)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.5)
    await page.waitForTimeout(300)

    for (let i = 0; i < 10; i++) {
      await rapidWheelScroll(page, { down: i % 2 === 0, steps: 5, delta: 300, interval: 15 })
    }
    await page.waitForTimeout(800)

    const lines = await getCodeLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])
  })

  test('code block background color applied on all viewport code lines', async ({ page }) => {
    const doc = generateScrollDocument(25)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.4)
    await page.waitForTimeout(500)

    const bgCheck = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return []
      const vpFrom = view.viewport.from
      const vpTo = view.viewport.to

      const results: Array<{ text: string; bg: string; hasCodeBlock: boolean }> = []
      for (const line of document.querySelectorAll('.cm-line')) {
        const text = (line.textContent ?? '').trim()
        if (!text.startsWith('def func_') && !text.startsWith('# code block')) continue
        try {
          const pos = view.posAtDOM(line)
          if (pos < vpFrom || pos > vpTo) continue
        } catch { continue }
        const el = line as HTMLElement
        results.push({
          text: text.substring(0, 40),
          bg: getComputedStyle(el).backgroundColor,
          hasCodeBlock: el.classList.contains('cm-code-block'),
        })
      }
      return results
    })

    expect(bgCheck.length).toBeGreaterThan(0)
    const missingBg = bgCheck.filter(l => !l.hasCodeBlock)
    expect(missingBg).toEqual([])
  })
})

test.describe('Scroll Rendering - Blockquotes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('blockquote lines styled after scrolling past block start', async ({ page }) => {
    const doc = generateScrollDocument(30)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.35)
    await page.waitForTimeout(500)

    const lines = await getBlockquoteLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasBlockquote)
    expect(unstyled).toEqual([])
  })

  test('blockquote lines styled after rapid scroll', async ({ page }) => {
    const doc = generateScrollDocument(35)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await rapidWheelScroll(page, { down: true, steps: 25, delta: 350, interval: 20 })
    await page.waitForTimeout(800)

    const lines = await getBlockquoteLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasBlockquote)
    expect(unstyled).toEqual([])
  })
})

test.describe('Scroll Rendering - Mixed Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('all element types render correctly after fast scroll', async ({ page }) => {
    const parts: string[] = []
    for (let i = 0; i < 25; i++) {
      parts.push(`# Heading ${i}`)
      parts.push('')
      parts.push('Paragraph text for section.')
      parts.push('')
      parts.push('```javascript')
      parts.push(`const s${i} = "section ${i}";`)
      parts.push(`console.log(s${i});`)
      parts.push('```')
      parts.push('')
      parts.push(`> Quote for section ${i}.`)
      parts.push('')
      parts.push(`- item ${i}a`)
      parts.push(`- item ${i}b`)
      parts.push('')
      parts.push('---')
      parts.push('')
    }
    await setContent(page, parts.join('\n'))
    await focusEditor(page)
    await page.waitForTimeout(500)

    await rapidWheelScroll(page, { down: true, steps: 20, delta: 500, interval: 25 })
    await page.waitForTimeout(800)

    // Check code blocks
    const codeLines = await getCodeLinesInViewport(page)
    const unstyledCode = codeLines.filter(l => !l.hasCodeBlock)
    expect(unstyledCode).toEqual([])

    // Check headings
    const headingStatus = await getHeadingLinesInViewport(page)
    const unstyledHeadings = headingStatus.filter(h => !h.hasHeading)
    expect(unstyledHeadings).toEqual([])

    // Editor still functional
    await page.keyboard.press('End')
    await page.keyboard.type(' SCROLL_TEST')
    await page.waitForTimeout(300)
    const content = await getContent(page)
    expect(content).toContain('SCROLL_TEST')
  })

  test('extreme rapid scroll - many iterations with short intervals', async ({ page }) => {
    const doc = generateScrollDocument(50)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    for (let i = 0; i < 50; i++) {
      const fraction = Math.random()
      await page.evaluate((f) => {
        const scroller = document.querySelector('.cm-scroller')
        if (scroller) scroller.scrollTop = scroller.scrollHeight * f
      }, fraction)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(1000)

    const lines = await getCodeLinesInViewport(page)
    expect(lines.length).toBeGreaterThan(0)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])
  })
})

test.describe('Scroll Rendering - Edit After Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should edit code block content after scrolling', async ({ page }) => {
    const doc = generateScrollDocument(20)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.5)
    await page.waitForTimeout(300)

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return
      const doc = view.state.doc
      const vpFrom = view.viewport.from
      const vpTo = view.viewport.to
      for (let i = vpFrom; i < vpTo && i < doc.length; i++) {
        const line = doc.lineAt(i)
        const text = doc.sliceString(line.from, line.to)
        if (text.startsWith('def func_')) {
          view.dispatch({ selection: { anchor: line.to } })
          return
        }
        i = line.to
      }
    })
    await page.waitForTimeout(200)

    await page.keyboard.type('  # after_scroll_edit')
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toContain('after_scroll_edit')
  })

  test('should render correctly after scroll-edit-scroll cycle', async ({ page }) => {
    const doc = generateScrollDocument(25)
    await setContent(page, doc)
    await focusEditor(page)
    await page.waitForTimeout(500)

    await scrollToFraction(page, 0.3)
    await page.waitForTimeout(300)

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return
      const mid = Math.floor(view.state.doc.length / 2)
      view.dispatch({
        selection: { anchor: mid },
        changes: { from: mid, insert: 'EDIT1 ' },
      })
    })
    await page.waitForTimeout(300)

    await scrollToFraction(page, 0.6)
    await page.waitForTimeout(300)

    const lines = await getCodeLinesInViewport(page)
    const unstyled = lines.filter(l => !l.hasCodeBlock)
    expect(unstyled).toEqual([])

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return
      const pos = Math.floor(view.state.doc.length * 0.6)
      view.dispatch({
        selection: { anchor: pos },
        changes: { from: pos, insert: 'EDIT2 ' },
      })
    })
    await page.waitForTimeout(300)

    await scrollToFraction(page, 0.1)
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toContain('EDIT1')
    expect(content).toContain('EDIT2')
    expect(content).toContain('Section 0')
  })
})
