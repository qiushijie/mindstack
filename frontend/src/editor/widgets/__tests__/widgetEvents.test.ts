import { describe, it, expect, vi } from 'vitest'
import {
  addWidgetClickHandler,
  addWidgetMouseDownHandler,
  interceptWidgetMouse,
  interceptWidgetPointer,
  isInsideWidget,
} from '../widgetEvents'

function createEvent(type: string): Event {
  return new Event(type, { bubbles: true, cancelable: true })
}

function createMouseEvent(type: string): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true })
}

describe('widgetEvents', () => {
  it('interceptWidgetPointer prevents default and stops propagation', () => {
    const e = createEvent('pointerdown')
    interceptWidgetPointer(e)
    expect(e.defaultPrevented).toBe(true)
    expect(e.cancelBubble).toBe(true)
  })

  it('interceptWidgetMouse prevents default and stops propagation', () => {
    const e = createMouseEvent('click')
    interceptWidgetMouse(e)
    expect(e.defaultPrevented).toBe(true)
    expect(e.cancelBubble).toBe(true)
  })

  describe('isInsideWidget', () => {
    it('returns true when target is inside element with class', () => {
      const container = document.createElement('div')
      container.className = 'cm-math-preview'
      const child = document.createElement('span')
      container.appendChild(child)
      expect(isInsideWidget(child, 'cm-math-preview')).toBe(true)
    })

    it('returns false when target is outside element with class', () => {
      const el = document.createElement('span')
      expect(isInsideWidget(el, 'cm-math-preview')).toBe(false)
    })

    it('returns false for non-element target', () => {
      expect(isInsideWidget(null, 'cm-math-preview')).toBe(false)
      expect(isInsideWidget(document.createTextNode('x'), 'cm-math-preview')).toBe(false)
    })
  })

  describe('addWidgetClickHandler', () => {
    it('calls handler and prevents propagation', () => {
      const el = document.createElement('div')
      const handler = vi.fn()
      const cleanup = addWidgetClickHandler(el, handler)

      const e = createMouseEvent('click')
      el.dispatchEvent(e)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(e.defaultPrevented).toBe(true)
      expect(e.cancelBubble).toBe(true)

      cleanup()
    })

    it('removes listener on cleanup', () => {
      const el = document.createElement('div')
      const handler = vi.fn()
      const cleanup = addWidgetClickHandler(el, handler)
      cleanup()

      el.dispatchEvent(createMouseEvent('click'))
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('addWidgetMouseDownHandler', () => {
    it('calls handler and stops propagation without preventing default', () => {
      const el = document.createElement('div')
      const handler = vi.fn()
      const cleanup = addWidgetMouseDownHandler(el, handler)

      const e = createMouseEvent('mousedown')
      el.dispatchEvent(e)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(e.cancelBubble).toBe(true)
      expect(e.defaultPrevented).toBe(false)

      cleanup()
    })
  })
})
