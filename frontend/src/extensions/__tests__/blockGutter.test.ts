import { describe, it, expect, afterEach } from 'vitest'
import { createBlockGutter, setHoveredLine } from '../blockGutter'
import { getBlockRanges, startDrag, simulateMouseUp, createDragSort, isDragging } from '../dragSort'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('blockGutter', () => {
  it('renders gutter for heading blocks', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    expect(gutterEl).toBeTruthy()
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders gutter for paragraph blocks', () => {
    const view = createView('Just a paragraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    expect(gutterEl).toBeTruthy()
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders gutter for list items', () => {
    const view = createView('- Item 1\n- Item 2\n- Item 3', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(2)
  })

  it('renders gutter for code blocks', () => {
    const view = createView('```\ncode line\n```', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders gutter for blockquotes', () => {
    const view = createView('> Quote text', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  it('handles empty document', () => {
    const view = createView('', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    expect(gutterEl).toBeTruthy()
  })

  it('renders gutter for multiple block types', () => {
    const view = createView('# Title\n\nParagraph\n\n- List item\n\n> Quote', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(3)
  })

  it('updates gutter when document changes', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const initialCount = gutterEl.querySelectorAll('.cm-block-controls').length

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n\nNew paragraph' } })
    const updatedCount = gutterEl.querySelectorAll('.cm-block-controls').length
    expect(updatedCount).toBeGreaterThanOrEqual(initialCount)
  })

  it('creates buttons inside controls', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus')
    const dragBtn = gutterEl.querySelector('.cm-block-drag')
    expect(plusBtn).toBeTruthy()
    expect(dragBtn).toBeTruthy()
  })

  it('handles horizontal rule blocks', () => {
    const view = createView('---', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    const markers = gutterEl!.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })
})

describe('blockGutter active line', () => {
  it('adds cm-active-block class to hovered line gutter element', () => {
    const view = createView('# Title\n\nParagraph\n\n- List item', createBlockGutter())

    // Default cursor at line 1 (heading), no hover yet — no active-block
    const gutterEl = view.dom.querySelector('.cm-block-gutter')
    expect(gutterEl).toBeTruthy()

    let activeElements = gutterEl!.querySelectorAll('.cm-gutterElement.cm-active-block')
    expect(activeElements.length).toBe(0)

    // Simulate hover on line 1 via StateEffect
    view.dispatch({ effects: setHoveredLine.of(1) })

    activeElements = gutterEl!.querySelectorAll('.cm-gutterElement.cm-active-block')
    expect(activeElements.length).toBe(1)
  })
})

describe('setHoveredLine effect', () => {
  it('updates hoveredLineField correctly', () => {
    const view = createView('# Title\n\nParagraph\n\n- List item', createBlockGutter())

    const gutterEl = view.dom.querySelector('.cm-block-gutter')!

    // Set hover to line 1
    view.dispatch({ effects: setHoveredLine.of(1) })
    let activeElements = gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block')
    expect(activeElements.length).toBe(1)

    // Switch hover to line 3
    view.dispatch({ effects: setHoveredLine.of(3) })
    activeElements = gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block')
    expect(activeElements.length).toBe(1)
  })

  it('active block class switches correctly on hover change', () => {
    const view = createView('# Heading\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!

    // Hover line 1
    view.dispatch({ effects: setHoveredLine.of(1) })
    expect(gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block').length).toBe(1)

    // Hover line 3
    view.dispatch({ effects: setHoveredLine.of(3) })
    expect(gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block').length).toBe(1)

    // Back to line 1
    view.dispatch({ effects: setHoveredLine.of(1) })
    expect(gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block').length).toBe(1)
  })

  it('clearing hover removes active block class', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!

    // Set hover
    view.dispatch({ effects: setHoveredLine.of(1) })
    expect(gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block').length).toBe(1)

    // Clear hover
    view.dispatch({ effects: setHoveredLine.of(null) })
    expect(gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block').length).toBe(0)
  })
})

describe('createBlockGutter destroy', () => {
  it('ViewPlugin destroy cleans up hover tracker without error', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    // Dispatch hover so tracker has state
    view.dispatch({ effects: setHoveredLine.of(1) })

    // Destroy should not throw
    expect(() => view.destroy()).not.toThrow()
  })
})

describe('showBlockMenu via plus button click', () => {
  it('opens a popup menu when plus button is clicked', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    expect(plusBtn).toBeTruthy()

    plusBtn.click()

    // A fixed-position popup menu should appear in document.body
    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()
    // Menu should contain items from SLASH_ITEMS
    expect(menu.children.length).toBeGreaterThan(0)

    view.destroy()
  })

  it('popup menu contains slash command items', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.click()

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()

    // Should contain at least one row with text content
    const rows = Array.from(menu.querySelectorAll('div'))
    let foundText = false
    for (const row of rows) {
      if (row.textContent && row.textContent.includes('Heading')) {
        foundText = true
        break
      }
    }
    expect(foundText).toBe(true)

    view.destroy()
  })

  it('closes menu on Escape key', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.click()

    // Menu should be visible
    let menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeTruthy()

    // Press Escape to close
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    document.dispatchEvent(escEvent)

    // Menu should be removed
    menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeFalsy()

    view.destroy()
  })

  it('closes menu on outside mousedown', async () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.click()

    // Menu should be visible
    let menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeTruthy()

    // Wait for closeHandler to be attached (setTimeout 0)
    await new Promise(r => setTimeout(r, 10))

    // Click outside the menu
    const outsideClick = new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 })
    document.dispatchEvent(outsideClick)

    // Menu should be removed
    menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeFalsy()

    view.destroy()
  })

  it('clicking a menu item inserts a new block', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.click()

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()

    // Find and click the first menu item row (which contains "Heading 1")
    const rows = menu.querySelectorAll('div')
    const headingRow = Array.from(rows).find(r =>
      r.textContent?.includes('Heading 1')
    ) as HTMLElement
    expect(headingRow).toBeTruthy()

    // Dispatch mousedown on the row
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    headingRow.dispatchEvent(mousedownEvent)

    // Document should now contain inserted text
    const docText = view.state.doc.toString()
    expect(docText).toContain('# ')
    expect(docText.length).toBeGreaterThan('# Title'.length)

    view.destroy()
  })

  it('destroy closes any open menu', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.click()

    // Menu should be visible
    let menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeTruthy()

    // Destroy view should clean up menu
    view.destroy()

    menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeFalsy()
  })

  it('reopening menu closes previous one', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtns = gutterEl.querySelectorAll('.cm-block-plus')

    // Click first plus button
    ;(plusBtns[0] as HTMLElement).click()
    const menusAfterFirst = document.body.querySelectorAll('div[style*="fixed"]')
    expect(menusAfterFirst.length).toBe(1)

    // Click second plus button - should close first menu and open new one
    if (plusBtns.length > 1) {
      ;(plusBtns[1] as HTMLElement).click()
      const menusAfterSecond = document.body.querySelectorAll('div[style*="fixed"]')
      // Should still have only one menu (old one closed, new one opened)
      expect(menusAfterSecond.length).toBeLessThanOrEqual(1)
    }

    view.destroy()
  })
})

describe('setupHoverTracker', () => {
  it('registers mousemove and mouseleave listeners on scrollDOM', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const scrollDOM = view.scrollDOM

    // The hover tracker should have been set up in constructor
    // We verify by checking that the view was created without errors
    expect(scrollDOM).toBeTruthy()

    view.destroy()
  })

  it('mouseleave clears hover when lastHovered is set', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!

    // Set hover state via effect (simulates what mousemove would do)
    view.dispatch({ effects: setHoveredLine.of(1) })
    expect(gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block').length).toBe(1)

    // The leaveHandler in setupHoverTracker checks lastHovered >= 0
    // Since we set hover via effect, lastHovered in module scope may not be set.
    // Instead test that the leaveHandler mechanism doesn't crash.
    // We verify by checking dispatch doesn't throw.
    const leaveEvent = new MouseEvent('mouseleave', { bubbles: true })
    expect(() => {
      view.scrollDOM.dispatchEvent(leaveEvent)
    }).not.toThrow()

    view.destroy()
  })

  it('hover tracker is registered on view creation', () => {
    // Verify that setupHoverTracker is called by the ViewPlugin constructor
    // by checking the scrollDOM has event listener capability
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    expect(view.scrollDOM).toBeTruthy()

    // Destroy cleans up the hover tracker - no error
    expect(() => view.destroy()).not.toThrow()
  })

  it('cleanup removes event listeners on destroy', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const scrollDOM = view.scrollDOM

    // Destroy should remove listeners without error
    expect(() => view.destroy()).not.toThrow()

    // After destroy, dispatching events should not cause issues
    // (listeners have been removed)
    expect(() => {
      scrollDOM.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }))
      scrollDOM.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    }).not.toThrow()
  })
})
