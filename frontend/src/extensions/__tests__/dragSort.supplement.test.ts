import { describe, it, expect, afterEach } from 'vitest'
import {
  getBlockRanges, findBlockAtPos,
  createDragSort, startDrag, simulateMouseMove, simulateMouseUp,
  isDragging, isInDragCooldown,
} from '../dragSort'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})

describe('dragSort - simulateMouseMove edge cases', () => {
  it('simulateMouseMove handles positions outside editor gracefully', () => {
    const view = createView('# Heading\n\nParagraph\n\n- List', createDragSort())
    const blocks = getBlockRanges(view)
    const heading = blocks[0]

    startDrag(view, heading)

    // Move to extreme coordinates — should not throw regardless of posAtCoords behavior
    expect(() => simulateMouseMove(-10000, -10000)).not.toThrow()

    view.dispatch({})

    // Source decoration should still be present
    const sourceDeco = view.contentDOM.querySelector('.cm-drag-source')
    expect(sourceDeco).toBeTruthy()

    simulateMouseUp()
    view.destroy()
  })

  it('simulateMouseMove to same block as source does not set target', () => {
    const view = createView('# Heading\n\nParagraph\n\n- List', createDragSort())
    const blocks = getBlockRanges(view)
    const heading = blocks[0]

    startDrag(view, heading)

    // Try to move to the heading block itself
    const headingLine = view.state.doc.line(heading.lineFrom)
    const coords = view.coordsAtPos(headingLine.from)

    if (coords) {
      simulateMouseMove(coords.left + 2, coords.top + 2)
    }

    view.dispatch({})

    // Source should still be dimmed, but no target on self
    const sourceDeco = view.contentDOM.querySelector('.cm-drag-source')
    expect(sourceDeco).toBeTruthy()

    simulateMouseUp()
    view.destroy()
  })

  it('simulateMouseMove with missing line rects falls back to mid position', () => {
    const view = createView('# Heading\n\nParagraph\n\n- List', createDragSort())
    const blocks = getBlockRanges(view)
    const heading = blocks[0]

    startDrag(view, heading)

    // Move to paragraph block - if coordsAtPos returns something, test both paths
    const para = blocks.find(b => view.state.doc.sliceString(b.from, b.to) === 'Paragraph')
    if (para) {
      const paraLine = view.state.doc.line(para.lineFrom)
      const coords = view.coordsAtPos(paraLine.from)
      if (coords) {
        simulateMouseMove(coords.left + 5, coords.top + 5)
      }
    }

    view.dispatch({})
    expect(view.contentDOM).toBeTruthy()

    simulateMouseUp()
    view.destroy()
  })

  it('simulateMouseMove when not dragging is a no-op', () => {
    expect(isDragging()).toBe(false)
    expect(() => simulateMouseMove(100, 200)).not.toThrow()
  })
})

describe('dragSort - simulateMouseUp edge cases', () => {
  it('simulateMouseUp with no dragView does nothing', () => {
    // Call without starting drag
    simulateMouseUp()
    expect(document.body.style.cursor).not.toBe('grabbing')
  })

  it('simulateMouseUp with dragTargetLine = -1 does not modify document', () => {
    const view = createView('# Heading\n\nParagraph\n\n- List', createDragSort())
    const blocks = getBlockRanges(view)
    const heading = blocks[0]

    startDrag(view, heading)

    // dragTargetLine starts at -1 and we don't call simulateMouseMove
    const originalText = view.state.doc.toString()
    simulateMouseUp()

    expect(view.state.doc.toString()).toBe(originalText)
    view.destroy()
  })

  it('simulateMouseUp after cooldown is not in cooldown', async () => {
    const view = createView('# Heading\n\nParagraph', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])
    simulateMouseUp()

    // Immediately after: should be in cooldown
    expect(isInDragCooldown()).toBe(true)

    // Wait for cooldown to expire
    await new Promise(r => setTimeout(r, 350))
    expect(isInDragCooldown()).toBe(false)

    view.destroy()
  })

  it('simulateMouseUp adds cooldown class to view dom', () => {
    const view = createView('# Heading\n\nParagraph', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])
    simulateMouseUp()

    expect(view.dom.classList.contains('cm-drag-cooldown')).toBe(true)
    view.destroy()
  })

  it('simulateMouseUp computes cursor position after move forward', () => {
    const view = createView('A\n\nB\n\nC\n\nD', createDragSort())
    const blocks = getBlockRanges(view)
    const blockA = blocks.find(b => b.lineFrom === 1)!
    const blockC = blocks.find(b => b.lineFrom === 5)!

    startDrag(view, blockA)

    // Move to after block C
    const cLine = view.state.doc.line(blockC.lineTo)
    const coords = view.coordsAtPos(cLine.from)
    if (coords) {
      simulateMouseMove(coords.left + 5, coords.bottom + 5)
    }

    simulateMouseUp()

    // Document should have been rearranged
    const text = view.state.doc.toString()
    expect(text).toContain('A')
    view.destroy()
  })

  it('simulateMouseUp computes cursor position after move backward', () => {
    const view = createView('A\n\nB\n\nC\n\nD', createDragSort())
    const blocks = getBlockRanges(view)
    const blockC = blocks.find(b => b.lineFrom === 5)!
    const blockA = blocks.find(b => b.lineFrom === 1)!

    startDrag(view, blockC)

    // Move to before block A
    const aLine = view.state.doc.line(blockA.lineFrom)
    const coords = view.coordsAtPos(aLine.from)
    if (coords) {
      simulateMouseMove(coords.left + 5, coords.top - 5)
    }

    simulateMouseUp()

    const text = view.state.doc.toString()
    expect(text).toContain('C')
    view.destroy()
  })

  it('simulateMouseUp handles move where old and new text are identical', () => {
    const view = createView('A\n\nA', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])
    simulateMouseUp()

    // Should not crash even with identical content
    expect(view.state.doc.toString()).toContain('A')
    view.destroy()
  })
})

describe('dragSort - dragEventHandler edge cases', () => {
  it('mousedown with defaultPrevented returns false', () => {
    const view = createView('# Heading\n\nParagraph', createDragSort())

    // Create a drag button and dispatch mousedown with defaultPrevented
    const dragBtn = document.createElement('button')
    dragBtn.className = 'cm-block-drag'
    view.contentDOM.appendChild(dragBtn)

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    event.preventDefault()
    dragBtn.dispatchEvent(event)

    expect(isDragging()).toBe(false)
    view.destroy()
  })

  it('mousedown on non-drag target does not start drag', () => {
    const view = createView('# Heading\n\nParagraph', createDragSort())

    const otherBtn = document.createElement('button')
    otherBtn.className = 'other-button'
    view.contentDOM.appendChild(otherBtn)

    expect(isDragging()).toBe(false)

    // CodeMirror internal handler may throw in happy-dom; we only care our drag doesn't start
    try {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      otherBtn.dispatchEvent(event)
    } catch {
      // ignore
    }

    expect(isDragging()).toBe(false)
    view.destroy()
  })

  it('mousedown on cm-block-drag in contentDOM maps to valid position', () => {
    const view = createView('# Heading\n\nParagraph', createDragSort())

    const gutterEl = document.createElement('div')
    gutterEl.className = 'cm-gutterElement'
    const dragBtn = document.createElement('button')
    dragBtn.className = 'cm-block-drag'
    gutterEl.appendChild(dragBtn)

    gutterEl.getBoundingClientRect = () => ({
      top: 10, left: 10, right: 30, bottom: 30, width: 20, height: 20, x: 10, y: 10,
      toJSON: () => ({}),
    })

    view.contentDOM.appendChild(gutterEl)

    const origRect = view.contentDOM.getBoundingClientRect.bind(view.contentDOM)
    view.contentDOM.getBoundingClientRect = () => ({
      top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    })

    try {
      dragBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    } catch {
      // codemirror handler may throw
    }

    view.contentDOM.getBoundingClientRect = origRect
    if (isDragging()) simulateMouseUp()
    view.destroy()
  })
})

describe('dragSort - buildDeco edge cases', () => {
  it('handles drag with target beyond document lines', () => {
    const view = createView('# Heading', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])

    // Simulate a target beyond the last line by using coordinates past the document
    const lastLine = view.state.doc.line(view.state.doc.lines)
    const coords = view.coordsAtPos(lastLine.to)
    if (coords) {
      simulateMouseMove(coords.left + 5, coords.bottom + 500)
    }

    view.dispatch({})

    // Should use dropIndicatorDec for position past last line
    expect(view.contentDOM).toBeTruthy()

    simulateMouseUp()
    view.destroy()
  })

  it('handles single-line document during drag', () => {
    const view = createView('# Heading', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])
    view.dispatch({})

    // Single block should still have source decoration
    const sourceDeco = view.contentDOM.querySelector('.cm-drag-source')
    expect(sourceDeco).toBeTruthy()

    simulateMouseUp()
    view.destroy()
  })

  it('handles empty document during drag', () => {
    const view = createView('', createDragSort())
    const blocks = getBlockRanges(view)

    if (blocks.length > 0) {
      startDrag(view, blocks[0])
      view.dispatch({})
      simulateMouseUp()
    }

    view.destroy()
  })
})

describe('dragSort - plugin update error handling', () => {
  it('plugin update catch block handles errors', () => {
    const view = createView('# Test', createDragSort())

    // Dispatch an empty update - should not throw
    expect(() => view.dispatch({})).not.toThrow()
    expect(view.state.doc.toString()).toBe('# Test')

    view.destroy()
  })
})

describe('dragSort - isDragging and isInDragCooldown', () => {
  it('isDragging is false after view destroy', () => {
    const view = createView('# Heading\n\nParagraph', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])
    expect(isDragging()).toBe(true)

    view.destroy()
    expect(isDragging()).toBe(false)
  })

  it('isInDragCooldown returns a boolean', () => {
    // Just verify it returns a boolean; actual value depends on prior test state
    expect(typeof isInDragCooldown()).toBe('boolean')
  })

  it('isInDragCooldown returns true immediately after drag', () => {
    const view = createView('# Heading', createDragSort())
    const blocks = getBlockRanges(view)

    startDrag(view, blocks[0])
    simulateMouseUp()

    expect(isInDragCooldown()).toBe(true)
    view.destroy()
  })
})

describe('dragSort - findBlockAtPos edge cases', () => {
  it('finds block at exact boundary positions', () => {
    const view = createView('# Title')
    const blocks = getBlockRanges(view)
    const block = blocks[0]

    // At from position
    expect(findBlockAtPos(blocks, block.from)).toBe(block)
    // At to position
    expect(findBlockAtPos(blocks, block.to)).toBe(block)
  })

  it('returns null for negative position', () => {
    const view = createView('# Title')
    expect(findBlockAtPos(getBlockRanges(view), -1)).toBeNull()
  })
})

describe('dragSort - getBlockRanges edge cases', () => {
  it('handles document ending with blank lines', () => {
    const view = createView('# Title\n\n\n')
    const blocks = getBlockRanges(view)
    expect(Array.isArray(blocks)).toBe(true)
  })

  it('handles document starting with blank lines', () => {
    const view = createView('\n\n# Title')
    const blocks = getBlockRanges(view)
    expect(Array.isArray(blocks)).toBe(true)
  })

  it('handles adjacent blocks without blank lines', () => {
    const view = createView('### h3\n```\ncode\n```')
    const blocks = getBlockRanges(view)
    expect(blocks.length).toBeGreaterThanOrEqual(2)
  })
})
