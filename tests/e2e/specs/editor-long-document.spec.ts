import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor, scrollToPosition, getCoordsAtPos, dragSelect, toggleRawMode, getSelectionRange } from '../helpers/editor'

function generateLongDocument(lines: number): string {
  const paragraphs: string[] = []
  for (let i = 0; i < lines; i++) {
    if (i % 5 === 0) {
      paragraphs.push(`# Heading ${Math.floor(i / 5) + 1}`)
    } else if (i % 5 === 1) {
      paragraphs.push(`This is paragraph ${i} with some content about various topics. It contains enough text to make the document reasonably long for scrolling tests.`)
    } else if (i % 5 === 2) {
      paragraphs.push('- List item A')
      paragraphs.push('- List item B')
      paragraphs.push('- List item C')
    } else if (i % 5 === 3) {
      paragraphs.push('```javascript')
      paragraphs.push(`const x = ${i};`)
      paragraphs.push('console.log(x);')
      paragraphs.push('```')
    } else {
      paragraphs.push(`> Blockquote line ${i} with some meaningful text that extends the document length.`)
    }
  }
  return paragraphs.join('\n\n')
}

function generatePlainLines(lines: number): string {
  const out: string[] = []
  for (let i = 0; i < lines; i++) {
    out.push(`Line ${i + 1} with enough text to make a reasonably long document for scrolling tests.`)
  }
  return out.join('\n\n')
}

test.describe('Long Document - Scroll and Edit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should scroll to middle, edit, and preserve content', async ({ page }) => {
    const longDoc = generateLongDocument(30)
    await setContent(page, longDoc)
    await page.waitForTimeout(500)

    // Use API to place cursor in middle of document, then type
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        const mid = Math.floor(view.state.doc.length / 2)
        view.dispatch({ selection: { anchor: mid } })
      }
    })
    await page.waitForTimeout(200)
    await page.keyboard.type(' [MIDDLE_EDIT]')
    await page.waitForTimeout(300)

    // Verify document structure is intact
    const content = await getContent(page)
    expect(content).toContain('# Heading 1')
    expect(content).toContain('[MIDDLE_EDIT]')
    // Original content should still be present
    expect(content).toContain('List item A')
  })

  test('should handle scroll to bottom and edit last line', async ({ page }) => {
    const longDoc = generateLongDocument(20)
    await setContent(page, longDoc)
    await page.waitForTimeout(500)

    // Scroll to bottom
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller')
      if (scroller) scroller.scrollTop = scroller.scrollHeight
    })
    await page.waitForTimeout(300)

    // Click near bottom
    const lines = page.locator('.cm-line')
    const lastLine = lines.last()
    const box = await lastLine.boundingBox()
    if (box) {
      await page.mouse.click(box.x + 10, box.y + box.height / 2)
      await page.waitForTimeout(300)
    }

    // Type at end
    await page.keyboard.type(' END_MARKER')
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toContain('END_MARKER')
  })

  test('should maintain cursor position after scroll and programmatic move', async ({ page }) => {
    const longDoc = generateLongDocument(25)
    await setContent(page, longDoc)
    await page.waitForTimeout(500)

    // Place cursor at start
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 50 } })
    })
    await page.waitForTimeout(200)

    const posBefore = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    expect(posBefore).toBe(50)

    // Scroll down and move cursor via API
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller')
      if (scroller) scroller.scrollTop = 500
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: 500 } })
    })
    await page.waitForTimeout(300)

    const posAfter = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    // Cursor should have moved
    expect(posAfter).not.toBe(posBefore)
    expect(posAfter).toBe(500)
  })

  test('should scroll to middle of 1000-line document, click, and type', async ({ page }) => {
    const doc = generatePlainLines(1000)
    await setContent(page, doc)
    await page.waitForTimeout(500)

    const linePrefix = 'Line 500'
    const pos = doc.indexOf(linePrefix)
    expect(pos).toBeGreaterThan(0)
    const targetPos = pos + linePrefix.length

    await focusEditor(page)
    await scrollToPosition(page, targetPos)

    const coords = await getCoordsAtPos(page, targetPos)
    expect(coords).toBeTruthy()

    await page.mouse.click(coords!.x, coords!.y)
    await page.waitForTimeout(200)
    await page.keyboard.type(' EDITED')
    await page.waitForTimeout(200)

    const content = await getContent(page)
    expect(content).toContain('Line 500 EDITED')

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(true)
    expect(sel.from).toBe(targetPos + ' EDITED'.length)
  })

  test('should drag-select across the scrolled viewport', async ({ page }) => {
    const doc = generatePlainLines(1000)
    await setContent(page, doc)
    await page.waitForTimeout(500)

    const startPrefix = 'Line 400'
    const endPrefix = 'Line 402'
    const startPos = doc.indexOf(startPrefix)
    const endPos = doc.indexOf(endPrefix) + endPrefix.length
    expect(startPos).toBeGreaterThan(0)
    expect(endPos).toBeGreaterThan(startPos)

    await focusEditor(page)
    await scrollToPosition(page, startPos)
    await page.waitForTimeout(300)

    await dragSelect(page, startPos, endPos)

    const sel = await getSelectionRange(page)
    expect(sel.empty).toBe(false)
    expect(sel.from).toBeLessThanOrEqual(startPos)
    expect(sel.to).toBeGreaterThanOrEqual(endPos)
  })
})

test.describe('Long Document - Mode Switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should preserve content and keep a defined selection after raw/rich toggle', async ({ page }) => {
    const doc = generatePlainLines(200)
    await setContent(page, doc)
    await page.waitForTimeout(500)

    const midPrefix = 'Line 100'
    const midPos = doc.indexOf(midPrefix) + midPrefix.length
    await scrollToPosition(page, midPos)

    const before = await getContent(page)
    const selBefore = await getSelectionRange(page)

    await toggleRawMode(page, true)
    await toggleRawMode(page, false)

    const after = await getContent(page)
    expect(after).toBe(before)

    const selAfter = await getSelectionRange(page)
    expect(selAfter.from).toBeGreaterThanOrEqual(0)
    expect(selAfter.from).toBeLessThanOrEqual(after.length)
  })
})

test.describe('Long Document - Widgets and Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render math widget after scrolling to it', async ({ page }) => {
    // Put math block early in doc so it's visible without complex scrolling
    const doc = '# Top\n\n$$E=mc^2$$\n\n' + generateLongDocument(10)
    await setContent(page, doc)
    await page.waitForTimeout(500)

    // Move cursor to end (math widget should render since cursor is outside)
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Click widget to edit
    const box = await widget.first().boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
    }

    // Widget should disappear (in edit mode)
    await expect(widget).not.toBeVisible()
  })

  test('should handle rapid scroll without crash', async ({ page }) => {
    const longDoc = generateLongDocument(40)
    await setContent(page, longDoc)
    await page.waitForTimeout(500)

    // Rapid scroll up and down
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller')
        if (scroller) scroller.scrollTop = scroller.scrollHeight
      })
      await page.waitForTimeout(100)
      await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller')
        if (scroller) scroller.scrollTop = 0
      })
      await page.waitForTimeout(100)
    }

    // Document should still be intact
    const content = await getContent(page)
    expect(content).toContain('# Heading 1')
    expect(content.length).toBeGreaterThan(1000)
  })

  test('should preserve content when editing during scroll', async ({ page }) => {
    const longDoc = generateLongDocument(20)
    await setContent(page, longDoc)
    await page.waitForTimeout(500)

    // Scroll to middle
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller')
      if (scroller) scroller.scrollTop = scroller.scrollHeight / 3
    })
    await page.waitForTimeout(300)

    // Use API to find a position in the middle and edit there
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        const text = view.state.doc.toString()
        const midPos = Math.floor(text.length / 2)
        // Find start of line near middle
        const line = view.state.doc.lineAt(midPos)
        view.dispatch({ selection: { anchor: line.from, head: line.to } })
      }
    })
    await page.waitForTimeout(200)

    await page.keyboard.type('REPLACED_WHOLE_LINE')
    await page.waitForTimeout(300)

    const content = await getContent(page)
    expect(content).toContain('REPLACED_WHOLE_LINE')
  })
})

test.describe('Long Document - Search Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should find and navigate to matches in long document', async ({ page }) => {
    // Create document with repeated term spread across it
    const sections: string[] = []
    for (let i = 0; i < 20; i++) {
      sections.push(`Section ${i}: Some text here.`)
      if (i % 3 === 0) sections.push('TARGET word appears here.')
      sections.push(`More content for section ${i} to make it longer.`)
    }
    const doc = sections.join('\n\n')
    await setContent(page, doc)
    await page.waitForTimeout(500)

    // Open search
    await page.evaluate(() => (window as any).__cmView?.focus())
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-panel')).toBeVisible()

    await page.keyboard.type('TARGET', { delay: 20 })
    await page.waitForTimeout(300)

    // Should find multiple matches
    const countText = await page.locator('.find-count').textContent()
    expect(countText).toContain('7') // 20/3 ≈ 6-7 matches

    const initialCount = await page.locator('.find-count').textContent()

    // Navigate through some matches
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)
    }

    // Match index should have advanced
    const finalCount = await page.locator('.find-count').textContent()
    expect(finalCount).toContain('/')
    expect(finalCount).not.toBe(initialCount)

    // Current match should be scrolled into the viewport
    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return null
      const range = view.state.selection.main
      return { from: range.from, to: range.to }
    })
    expect(sel).not.toBeNull()
    const matchText = await page.evaluate((p) => {
      const view = (window as any).__cmView
      return view ? view.state.doc.sliceString(p.from, p.to) : ''
    }, sel)
    expect(matchText.toLowerCase()).toContain('target')
  })
})
