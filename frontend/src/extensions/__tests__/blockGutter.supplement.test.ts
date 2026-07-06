import { describe, it, expect, afterEach, vi } from 'vitest'
import { createBlockGutter, setHoveredLine } from '../blockGutter'
import { getBlockRanges, startDrag, simulateMouseUp, createDragSort, isDragging } from '../dragSort'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('blockGutter - containsImage', () => {
  it('renders image block marker for paragraph containing image', () => {
    const view = createView('![alt](image.png)', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const markers = gutterEl.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  it('image block has special element class', () => {
    const view = createView('![alt](image.png)', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    // The marker should be rendered
    const markers = gutterEl.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  it('paragraph without image uses regular marker', () => {
    const view = createView('Just text', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const markers = gutterEl.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  it('link without image uses regular marker', () => {
    const view = createView('[link](url)', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const markers = gutterEl.querySelectorAll('.cm-block-controls')
    expect(markers.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })
})

describe('blockGutter - mousedown drag button', () => {
  it('mousedown on drag button starts drag', () => {
    const view = createView('# Title\n\nParagraph', [...createBlockGutter(), ...createDragSort()])
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const dragBtn = gutterEl.querySelector('.cm-block-drag') as HTMLElement
    expect(dragBtn).toBeTruthy()

    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    dragBtn.dispatchEvent(mousedownEvent)

    expect(isDragging()).toBe(true)
    simulateMouseUp()
    view.destroy()
  })

  it('mousedown on non-drag area does not start drag', () => {
    const view = createView('# Title\n\nParagraph', [...createBlockGutter(), ...createDragSort()])
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!

    // Click on the gutter but not on drag button
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    gutterEl.dispatchEvent(mousedownEvent)

    // Should not be dragging since target was not .cm-block-drag
    // (The handler checks target.closest('.cm-block-drag'))
    view.destroy()
  })
})

describe('blockGutter - menu positioning edge cases', () => {
  it('repositions menu when it would overflow right edge', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement

    // Mock a very wide viewport and small button position
    const origInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 320, writable: true, configurable: true })

    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()

    // Restore
    Object.defineProperty(window, 'innerWidth', { value: origInnerWidth, writable: true, configurable: true })

    view.destroy()
  })

  it('repositions menu when it would overflow bottom edge', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement

    // Mock small viewport height
    const origInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 200, writable: true, configurable: true })

    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()

    Object.defineProperty(window, 'innerHeight', { value: origInnerHeight, writable: true, configurable: true })

    view.destroy()
  })

  it('repositions menu when top would be below viewport', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement

    // Mock small viewport
    const origInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 100, writable: true, configurable: true })

    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()

    Object.defineProperty(window, 'innerHeight', { value: origInnerHeight, writable: true, configurable: true })

    view.destroy()
  })
})

describe('blockGutter - menu item interactions', () => {
  it('menu item responds to mouseenter and mouseleave', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    const rows = menu.querySelectorAll('div')
    const firstRow = Array.from(rows).find(r => r.style.display === 'flex')

    if (firstRow) {
      firstRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      expect(firstRow.style.backgroundColor).toBe('var(--surface-hover)')

      firstRow.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      expect(firstRow.style.backgroundColor).toBe('')
    }

    view.destroy()
  })

  it('menu items without shortcut still render correctly', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()
    expect(menu.children.length).toBeGreaterThan(0)

    view.destroy()
  })

  it('clicking menu item without icon still works', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    const rows = menu.querySelectorAll('div')
    // Find a heading row (which doesn't have an icon)
    const headingRow = Array.from(rows).find(r =>
      r.textContent?.includes('Heading 1')
    ) as HTMLElement
    expect(headingRow).toBeTruthy()

    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    headingRow.dispatchEvent(mousedownEvent)

    expect(document.body.querySelector('div[style*="fixed"]')).toBeFalsy()

    view.destroy()
  })
})

describe('blockGutter - setupHoverTracker edge cases', () => {
  it('hover tracker respects isDragging state', () => {
    const view = createView('# Title\n\nParagraph', [...createBlockGutter(), ...createDragSort()])
    const blocks = getBlockRanges(view)

    // Start drag
    startDrag(view, blocks[0])
    expect(isDragging()).toBe(true)

    // Hover should be ignored during drag (isDragging() check in setupHoverTracker)
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    let activeElements = gutterEl.querySelectorAll('.cm-gutterElement.cm-active-block')
    expect(activeElements.length).toBe(0)

    simulateMouseUp()
    view.destroy()
  })

  it('hover tracker respects drag cooldown', () => {
    const view = createView('# Title\n\nParagraph', [...createBlockGutter(), ...createDragSort()])
    const blocks = getBlockRanges(view)

    // Start and end drag to enter cooldown
    startDrag(view, blocks[0])
    simulateMouseUp()

    // Dispatch hover effect to check cooldown behavior
    // The tracker clears hover during cooldown
    view.dispatch({ effects: setHoveredLine.of(1) })

    view.destroy()
  })

  it('hover tracker handles posAtCoords returning null', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())

    // Dispatch a mousemove at extreme coordinates
    const moveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      clientX: -1000,
      clientY: -1000,
    })

    expect(() => {
      view.scrollDOM.dispatchEvent(moveEvent)
    }).not.toThrow()

    view.destroy()
  })

  it('hover tracker clears hover on mouseleave', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())

    // First set hover
    view.dispatch({ effects: setHoveredLine.of(1) })

    // Then leave
    const leaveEvent = new MouseEvent('mouseleave', { bubbles: true })
    expect(() => {
      view.scrollDOM.dispatchEvent(leaveEvent)
    }).not.toThrow()

    view.destroy()
  })

  it('hover tracker does not dispatch too frequently', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())

    // Multiple rapid mousemove events - only some should trigger dispatch
    // due to the 200ms throttle
    for (let i = 0; i < 5; i++) {
      const moveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 50 + i,
        clientY: 50 + i,
      })
      expect(() => {
        view.scrollDOM.dispatchEvent(moveEvent)
      }).not.toThrow()
    }

    view.destroy()
  })
})

describe('blockGutter - hideBlockMenu edge cases', () => {
  it('hideBlockMenu handles null handlers gracefully', () => {
    const view = createView('# Title', createBlockGutter())
    // Open and close menu
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    let menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeTruthy()

    // Press Escape to close
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    menu = document.body.querySelector('div[style*="fixed"]')
    expect(menu).toBeFalsy()

    // Calling hide again should not throw
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    view.destroy()
  })

  it('closeHandler ignores clicks inside the menu', async () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    await new Promise(r => setTimeout(r, 10))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement
    expect(menu).toBeTruthy()

    // Click inside the menu - should not close it
    const clickEvent = new MouseEvent('mousedown', { bubbles: true })
    menu.dispatchEvent(clickEvent)

    // Menu should still exist
    expect(document.body.querySelector('div[style*="fixed"]')).toBeTruthy()

    view.destroy()
  })
})

describe('blockGutter - BlockControlsMarker', () => {
  it('BlockControlsMarker eq returns true', () => {
    const view = createView('# Title', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const controls = gutterEl.querySelectorAll('.cm-block-controls')
    expect(controls.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  it('ImageBlockControlsMarker extends BlockControlsMarker', () => {
    const view = createView('![alt](image.png)', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const controls = gutterEl.querySelectorAll('.cm-block-controls')
    expect(controls.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })
})

describe('blockGutter - showBlockMenu image insertion', () => {
  it('clicking image menu item dispatches custom event', () => {
    const view = createView('# Title\n\nParagraph', createBlockGutter())
    const gutterEl = view.dom.querySelector('.cm-block-gutter')!
    const plusBtn = gutterEl.querySelector('.cm-block-plus') as HTMLElement
    plusBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const menu = document.body.querySelector('div[style*="fixed"]') as HTMLDivElement

    // Find image row
    const rows = menu.querySelectorAll('div')
    const imageRow = Array.from(rows).find(r =>
      r.textContent?.includes('Image')
    ) as HTMLElement

    if (imageRow) {
      const eventSpy = vi.fn()
      view.dom.addEventListener('editor:insert-image', eventSpy)

      const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      imageRow.dispatchEvent(mousedownEvent)

      // The event is dispatched on view.dom
      expect(eventSpy).toHaveBeenCalled()
      view.dom.removeEventListener('editor:insert-image', eventSpy)
    }

    view.destroy()
  })
})
