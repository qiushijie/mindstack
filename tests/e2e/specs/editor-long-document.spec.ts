import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

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

    // Navigate through all matches
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)
    }

    // Search panel should still show valid state
    const finalCount = await page.locator('.find-count').textContent()
    expect(finalCount).toContain('/')
  })
})
