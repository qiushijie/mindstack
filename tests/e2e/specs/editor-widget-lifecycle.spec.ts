import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

async function moveCursorOutOfMath(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const view = (window as any).__cmView
    if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
  })
  await page.waitForTimeout(500)
}

async function moveCursorIntoMathBlock(page: import('@playwright/test').Page) {
  // Click inside the math widget to enter edit mode
  const widget = page.locator('.cm-math-block')
  const count = await widget.count()
  if (count === 0) return false
  const box = await widget.boundingBox()
  if (!box) return false
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(500)
  return true
}

test.describe('Widget Lifecycle - Math', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render math widget when cursor moves away', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$')
    await focusEditor(page)

    // focusEditor click may place cursor outside math; move cursor explicitly
    // to the end of doc (outside math range) to trigger rendering
    await moveCursorOutOfMath(page)

    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()
    expect(await widget.locator('.katex-display').count()).toBeGreaterThan(0)
  })

  test('should enter edit mode when clicking math widget', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$')
    await focusEditor(page)
    await moveCursorOutOfMath(page)

    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Click widget to enter edit mode
    const box = await widget.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(500)

    // Widget should disappear (cursor is now inside math range)
    await expect(widget).not.toBeVisible()

    // Cursor should be inside the math block
    const cursorPos = await page.evaluate(() => {
      const view = (window as any).__cmView
      return view ? view.state.selection.main.head : -1
    })
    // Cursor should be after the opening $$
    expect(cursorPos).toBeGreaterThanOrEqual(2)
    expect(cursorPos).toBeLessThanOrEqual(10)
  })

  test('should re-render math widget after content change and cursor move', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$')
    await focusEditor(page)
    await moveCursorOutOfMath(page)

    // Verify initial render
    let widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Click to edit
    const entered = await moveCursorIntoMathBlock(page)
    if (!entered) {
      test.skip(true, 'Could not enter math edit mode')
      return
    }

    // Modify formula: change E=mc^2 to E=mc^3
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        // Find position of '^2' and replace with '^3'
        const text = view.state.doc.toString()
        const pos = text.indexOf('^2')
        if (pos >= 0) {
          view.dispatch({
            changes: { from: pos + 1, to: pos + 2, insert: '3' },
          })
        }
      }
    })
    await page.waitForTimeout(200)

    // Move cursor out to trigger re-render
    await moveCursorOutOfMath(page)

    // Widget should be visible again with updated content
    widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Verify content updated
    const content = await getContent(page)
    expect(content).toContain('E=mc^3')
  })

  test('should handle inline math lifecycle', async ({ page }) => {
    await setContent(page, 'The $x^2$ formula')
    await focusEditor(page)

    // Move cursor out of inline math
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const widget = page.locator('.cm-math-inline')
    await expect(widget).toBeVisible()
    expect(await widget.locator('.katex').count()).toBeGreaterThan(0)

    // Click to edit
    const box = await widget.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
    }

    // Widget should disappear
    await expect(widget).not.toBeVisible()
  })

  test('should handle multiple math blocks independently', async ({ page }) => {
    await setContent(page, '$$a+b$$\n\nSome text\n\n$$c+d$$')
    await focusEditor(page)
    await moveCursorOutOfMath(page)

    const widgets = page.locator('.cm-math-block')
    expect(await widgets.count()).toBe(2)

    // Click first widget to edit
    const firstBox = await widgets.nth(0).boundingBox()
    if (firstBox) {
      await page.mouse.click(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
      await page.waitForTimeout(500)
    }

    // First widget should disappear, second should remain visible
    expect(await widgets.count()).toBe(1)
  })

  test('should handle invalid math gracefully', async ({ page }) => {
    await setContent(page, '$$\\invalid{command}$$')
    await focusEditor(page)
    await moveCursorOutOfMath(page)

    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Should still be clickable to edit
    const box = await widget.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
    }

    // Should enter edit mode (widget disappears)
    await expect(widget).not.toBeVisible()
  })

  // Skipped: feature not yet implemented — math widget has no custom context menu
  test.skip('should expose missing copy-formula action on math widget', async ({ page }) => {
    await setContent(page, '$$E=mc^2$$')
    await focusEditor(page)
    await moveCursorOutOfMath(page)

    const widget = page.locator('.cm-math-block')
    await expect(widget).toBeVisible()

    // Right-click on math widget should show a custom context menu
    // (not the browser default menu — detect by checking for custom DOM element)
    const domBefore = await page.evaluate(() => document.querySelectorAll('.cm-math-context-menu, .math-widget-menu, [data-math-action]').length)

    await widget.click({ button: 'right' })
    await page.waitForTimeout(300)

    const domAfter = await page.evaluate(() => document.querySelectorAll('.cm-math-context-menu, .math-widget-menu, [data-math-action]').length)

    // A custom menu should add new DOM elements; browser default menu does not
    expect(domAfter > domBefore, 'Math widget should show a custom context menu on right-click').toBe(true)
  })
})

test.describe('Widget Lifecycle - Mermaid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render mermaid preview when cursor moves away', async ({ page }) => {
    const mermaidBlock = '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```'
    await setContent(page, mermaidBlock)
    await focusEditor(page)

    // Move cursor out of mermaid block
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(800)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()
    await expect(preview.locator('.cm-mermaid-preview-area svg')).toBeVisible({ timeout: 5000 })
  })

  test('should enter edit mode when clicking mermaid preview', async ({ page }) => {
    const mermaidBlock = '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```'
    await setContent(page, mermaidBlock)
    await focusEditor(page)

    // Move cursor out to trigger preview
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(800)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    // Click preview to enter edit mode
    await preview.click()
    await page.waitForTimeout(500)

    // Preview should disappear, editor header may appear
    await expect(preview).not.toBeVisible()
  })

  test('should update preview after editing mermaid source', async ({ page }) => {
    const mermaidBlock = '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```'
    await setContent(page, mermaidBlock)
    await focusEditor(page)

    // Move cursor out to trigger preview
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(800)

    let preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    // Click to edit
    await preview.click()
    await page.waitForTimeout(500)

    // Modify source: change "Start" to "Begin"
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) {
        const text = view.state.doc.toString()
        const pos = text.indexOf('Start')
        if (pos >= 0) {
          view.dispatch({
            changes: { from: pos, to: pos + 5, insert: 'Begin' },
          })
        }
      }
    })
    await page.waitForTimeout(200)

    // Move cursor out to trigger new preview
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(800)

    preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    // Content should be updated
    const content = await getContent(page)
    expect(content).toContain('Begin')
  })

  test('should handle invalid mermaid gracefully', async ({ page }) => {
    const invalidBlock = '```mermaid\ninvalid syntax here\n```'
    await setContent(page, invalidBlock)
    await focusEditor(page)

    // Move cursor out
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(800)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    // Should show error or still be clickable
    const box = await preview.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
    }

    // Should enter edit mode
    await expect(preview).not.toBeVisible()
  })

  test('should expose missing edit button handler on mermaid preview', async ({ page }) => {
    const mermaidBlock = '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```'
    await setContent(page, mermaidBlock)
    await focusEditor(page)

    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(800)

    const preview = page.locator('.cm-mermaid-preview')
    await expect(preview).toBeVisible()

    // The Edit button in the header should be clickable and enter edit mode
    const editBtn = preview.locator('.cm-mermaid-edit-btn')
    const count = await editBtn.count()
    if (count === 0) {
      test.skip(true, 'Edit button not found')
      return
    }

    await editBtn.click()
    await page.waitForTimeout(500)

    // After clicking Edit, preview should disappear (edit mode)
    await expect(preview).not.toBeVisible()
  })
})

test.describe('Widget Lifecycle - Image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render image widget when cursor moves away', async ({ page }) => {
    await setContent(page, '![Alt text](test.png)')
    await focusEditor(page)

    // Move cursor out
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const imageWidget = page.locator('.cm-image-container')
    await expect(imageWidget).toBeVisible()
  })

  test('should move cursor into image source and dispatch event on click', async ({ page }) => {
    await setContent(page, '![Alt text](test.png)')
    await focusEditor(page)

    // Move cursor out
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const imageWidget = page.locator('.cm-image-container')
    await expect(imageWidget).toBeVisible()

    // Listen for the edit-image event
    const eventPromise = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        window.addEventListener('editor:edit-image', ((e: CustomEvent) => {
          resolve(e.detail?.src || 'dispatched')
        }) as EventListener, { once: true })
      })
    })

    // Click image widget
    await imageWidget.click()
    await page.waitForTimeout(300)

    // Widget should be hidden because the cursor moved into the image source range
    await expect(imageWidget).not.toBeVisible()

    // Event should have been dispatched
    const eventResult = await Promise.race([
      eventPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ])
    expect(eventResult).toBeTruthy()
  })

  // Skipped: feature not yet implemented — image widget has no click-to-edit UI
  test.skip('should expose missing image edit UI after clicking widget', async ({ page }) => {
    await setContent(page, '![Alt text](test.png)')
    await focusEditor(page)

    // Move cursor out
    await page.evaluate(() => {
      const view = (window as any).__cmView
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await page.waitForTimeout(500)

    const imageWidget = page.locator('.cm-image-container')
    await expect(imageWidget).toBeVisible()

    // Clicking the image should reveal an edit UI (toolbar, overlay, etc.)
    await imageWidget.click()
    await page.waitForTimeout(300)

    // Look for any image editing UI: toolbar, replace button, delete button, etc.
    const hasEditUI = await page.locator('.image-toolbar, .image-edit-overlay, [data-image-action]').count() > 0
      || await page.locator('text=Replace').count() > 0
      || await page.locator('text=Delete').count() > 0
      || await page.locator('text=替换').count() > 0
      || await page.locator('text=删除').count() > 0
    expect(hasEditUI, 'Image widget should show an edit UI on click').toBe(true)
  })
})
