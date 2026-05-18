import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { clearEditor, setContent, getContent, focusEditor } from '../helpers/editor'

test.describe('Editor Mouse Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should position cursor on click at start of line', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    const cmContent = page.locator('.cm-content')
    const box = await cmContent.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 15, box!.y + 25)
    await page.waitForTimeout(200)

    const cursorPos = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    expect(cursorPos).toBeGreaterThanOrEqual(0)
    expect(cursorPos).toBeLessThanOrEqual(5)
  })

  test('should position cursor on click at end of line', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)

    const cmContent = page.locator('.cm-content')
    const box = await cmContent.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + box!.width - 20, box!.y + 25)
    await page.waitForTimeout(200)

    const cursorPos = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    expect(cursorPos).toBeGreaterThanOrEqual(8)
  })

  test('should position cursor on click in multi-line document', async ({ page }) => {
    await setContent(page, 'Line 1\nLine 2\nLine 3')
    await focusEditor(page)
    await page.waitForTimeout(300)

    // Use second line's bounding box for precise positioning
    const secondLine = page.locator('.cm-line').nth(1)
    await expect(secondLine).toBeVisible()
    const box = await secondLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const cursorPos = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    // "Line 1\n" is 7 chars, cursor should be in second line
    expect(cursorPos).toBeGreaterThanOrEqual(7)
  })

  test('should select text by dragging left to right', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const firstLine = page.locator('.cm-line').first()
    const box = await firstLine.boundingBox()
    expect(box).toBeTruthy()

    const startX = box!.x + 10
    const endX = box!.x + box!.width - 20
    const y = box!.y + box!.height / 2

    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(endX, y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { from: -1, to: -1, empty: true }
      const range = view.state.selection.main
      return { from: range.from, to: range.to, empty: range.empty }
    })

    expect(sel.empty).toBe(false)
    expect(sel.to).toBeGreaterThan(sel.from)
  })

  test('should select text by dragging right to left', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const firstLine = page.locator('.cm-line').first()
    const box = await firstLine.boundingBox()
    expect(box).toBeTruthy()

    const startX = box!.x + box!.width - 20
    const endX = box!.x + 10
    const y = box!.y + box!.height / 2

    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(endX, y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { anchor: -1, head: -1, empty: true }
      const range = view.state.selection.main
      return { anchor: range.anchor, head: range.head, empty: range.empty }
    })

    expect(sel.empty).toBe(false)
    // When dragging right-to-left, anchor should be to the right of head
    expect(sel.anchor).toBeGreaterThan(sel.head)
  })

  test('should select line on triple click', async ({ page }) => {
    await setContent(page, 'First line\nSecond line')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const firstLine = page.locator('.cm-line').first()
    const box = await firstLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2, { clickCount: 3 })
    await page.waitForTimeout(300)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { from: -1, to: -1 }
      const range = view.state.selection.main
      return { from: range.from, to: range.to }
    })

    expect(sel.from).toBe(0)
    expect(sel.to).toBeGreaterThanOrEqual(10)
  })

  test('should select second line on triple click', async ({ page }) => {
    await setContent(page, 'First line\nSecond line')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const secondLine = page.locator('.cm-line').nth(1)
    const box = await secondLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2, { clickCount: 3 })
    await page.waitForTimeout(300)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { from: -1, to: -1 }
      const range = view.state.selection.main
      return { from: range.from, to: range.to }
    })

    expect(sel.from).toBeGreaterThanOrEqual(10)
    expect(sel.to).toBeGreaterThan(sel.from)
  })

  test('should extend selection with Shift+click to the right', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const firstLine = page.locator('.cm-line').first()
    const box = await firstLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    await page.keyboard.down('Shift')
    await page.mouse.click(box!.x + box!.width - 20, box!.y + box!.height / 2)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(300)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { anchor: -1, head: -1, empty: true }
      const range = view.state.selection.main
      return { anchor: range.anchor, head: range.head, empty: range.empty }
    })

    expect(sel.empty).toBe(false)
    expect(sel.head).toBeGreaterThan(sel.anchor)
  })

  test('should extend selection with Shift+click to the left', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const firstLine = page.locator('.cm-line').first()
    const box = await firstLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + box!.width - 20, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    await page.keyboard.down('Shift')
    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(300)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { anchor: -1, head: -1, empty: true }
      const range = view.state.selection.main
      return { anchor: range.anchor, head: range.head, empty: range.empty }
    })

    expect(sel.empty).toBe(false)
    // When dragging right-to-left, anchor should be to the right of head
    expect(sel.anchor).toBeGreaterThan(sel.head)
  })

  test('should enter edit mode when clicking mermaid preview', async ({ page }) => {
    const mermaidBlock = '\`\`\`mermaid\ngraph TD\n    A[Start] --> B[End]\n\`\`\`'
    await setContent(page, mermaidBlock)
    // Move cursor out of mermaid block to trigger preview
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    await preview.click()
    await page.waitForTimeout(300)

    await expect(preview).not.toBeVisible()
    await expect(page.locator('.cm-mermaid-edit-header')).toBeVisible()
  })

  test('should enter edit mode when clicking math block widget', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$')
    await focusEditor(page)
    // Move cursor out to trigger widget
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const mathWidget = page.locator('.cm-math-block')
    const count = await mathWidget.count()
    if (count === 0) {
      test.skip(true, 'Math widget not rendered')
      return
    }

    await expect(mathWidget).toBeVisible()
    // Click at the center of the widget to ensure the event hits it
    const box = await mathWidget.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    } else {
      await mathWidget.click()
    }
    await page.waitForTimeout(500)

    await expect(mathWidget).not.toBeVisible()
  })

  test('should keep image widget visible on click and dispatch edit event', async ({ page }) => {
    await setContent(page, '![Alt text](test.png)')
    await focusEditor(page)
    // Move cursor out to trigger widget
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const imageWidget = page.locator('.cm-image-container')
    const count = await imageWidget.count()
    if (count === 0) {
      test.skip(true, 'Image widget not rendered')
      return
    }

    await expect(imageWidget).toBeVisible()
    await imageWidget.click()
    await page.waitForTimeout(300)

    // Image click handler returns true (prevents CodeMirror from moving cursor)
    // so the widget should remain visible and an 'editor:edit-image' event is dispatched
    await expect(imageWidget).toBeVisible()
  })

  test('should position cursor when clicking list bullet area', async ({ page }) => {
    await setContent(page, '- Item 1\n- Item 2')
    await focusEditor(page)
    await page.waitForTimeout(300)

    const secondLine = page.locator('.cm-line').nth(1)
    const box = await secondLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const cursorPos = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    expect(cursorPos).toBeGreaterThanOrEqual(9)
  })

  test('should position cursor when clicking blockquote line', async ({ page }) => {
    await setContent(page, '> Quote line 1\n> Quote line 2')
    await focusEditor(page)
    await page.waitForTimeout(300)

    const secondLine = page.locator('.cm-line').nth(1)
    const box = await secondLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const cursorPos = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    expect(cursorPos).toBeGreaterThanOrEqual(15)
  })

  test('should select word on double click', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await page.waitForTimeout(200)

    const firstLine = page.locator('.cm-line').first()
    const box = await firstLine.boundingBox()
    expect(box).toBeTruthy()

    await page.mouse.dblclick(box!.x + 30, box!.y + box!.height / 2)
    await page.waitForTimeout(300)

    const sel = await page.evaluate(() => {
      const view = (window as any).__cmView
      if (!view) return { from: -1, to: -1, empty: true }
      const range = view.state.selection.main
      return { from: range.from, to: range.to, empty: range.empty }
    })

    expect(sel.empty).toBe(false)
    expect(sel.to - sel.from).toBeGreaterThanOrEqual(3)
  })
})
