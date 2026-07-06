import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createView } from '../../test-utils/helpers'
import { MockEditorAdapter } from '../commands/__tests__/MockEditorAdapter'
import type { EditorAdapter } from '../EditorAdapter'
import {
  safeCoordsAtPos,
  safePosAtCoords,
  getSelectionRect,
  getLineFromMouseEvent,
  viewCoordsAtPos,
  viewPosAtCoords,
  viewSelectionRect,
  viewLineFromMouseEvent,
  constrainRectToViewport,
} from '../geometry'

class GeometryMockAdapter extends MockEditorAdapter {
  private rects: Map<number, DOMRect> = new Map()
  private positions: Map<string, number> = new Map()

  setRect(pos: number, rect: DOMRect): void {
    this.rects.set(pos, rect)
  }

  setPoint(point: { x: number; y: number }, pos: number): void {
    this.positions.set(`${point.x},${point.y}`, pos)
  }

  coordsAtPos(pos: number): DOMRect | null {
    return this.rects.get(pos) ?? null
  }

  posAtCoords(point: { x: number; y: number }): number | null {
    return this.positions.get(`${point.x},${point.y}`) ?? null
  }
}

function makeAdapter(content = 'hello\nworld'): GeometryMockAdapter {
  return new GeometryMockAdapter(content)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('adapter geometry helpers', () => {
  it('safeCoordsAtPos returns DOMRect from adapter', () => {
    const adapter = makeAdapter()
    const rect = new DOMRect(10, 20, 30, 40)
    adapter.setRect(2, rect)

    expect(safeCoordsAtPos(adapter, 2)).toEqual(rect)
  })

  it('safeCoordsAtPos returns null for missing rect', () => {
    const adapter = makeAdapter()
    expect(safeCoordsAtPos(adapter, 2)).toBeNull()
  })

  it('safeCoordsAtPos returns null when adapter throws', () => {
    class ThrowingCoordsAdapter extends MockEditorAdapter {
      coordsAtPos(): DOMRect | null {
        throw new Error('boom')
      }
    }
    const adapter: EditorAdapter = new ThrowingCoordsAdapter()
    expect(safeCoordsAtPos(adapter, 0)).toBeNull()
  })

  it('safePosAtCoords returns position from adapter', () => {
    const adapter = makeAdapter()
    adapter.setPoint({ x: 10, y: 20 }, 5)

    expect(safePosAtCoords(adapter, { x: 10, y: 20 })).toBe(5)
  })

  it('safePosAtCoords returns null when adapter lacks posAtCoords', () => {
    const adapter: EditorAdapter = new MockEditorAdapter()
    expect(safePosAtCoords(adapter, { x: 0, y: 0 })).toBeNull()
  })

  it('safePosAtCoords returns null when adapter throws', () => {
    class ThrowingPosAdapter extends MockEditorAdapter {
      posAtCoords(): number | null {
        throw new Error('boom')
      }
    }
    const adapter: EditorAdapter = new ThrowingPosAdapter()
    expect(safePosAtCoords(adapter, { x: 0, y: 0 })).toBeNull()
  })

  it('getSelectionRect returns bounding box of anchor and head', () => {
    const adapter = makeAdapter()
    adapter.setRect(1, new DOMRect(10, 20, 30, 40)) // right: 40, bottom: 60
    adapter.setRect(5, new DOMRect(50, 10, 20, 30)) // right: 70, bottom: 40

    const rect = getSelectionRect(adapter, { anchor: 1, head: 5 })
    expect(rect).not.toBeNull()
    expect(rect!.left).toBe(10)
    expect(rect!.top).toBe(10)
    expect(rect!.right).toBe(70)
    expect(rect!.bottom).toBe(60)
  })

  it('getSelectionRect returns null when one side is missing', () => {
    const adapter = makeAdapter()
    adapter.setRect(1, new DOMRect(0, 0, 10, 10))

    expect(getSelectionRect(adapter, { anchor: 1, head: 5 })).toBeNull()
  })

  it('getLineFromMouseEvent returns line number for mapped point', () => {
    const adapter = makeAdapter('line one\nline two')
    // position 12 is inside line 2 ('line one\n' = 9 chars, so 12 is in line two)
    adapter.setPoint({ x: 50, y: 30 }, 12)

    expect(getLineFromMouseEvent(adapter, { clientX: 50, clientY: 30 } as MouseEvent)).toBe(2)
  })

  it('getLineFromMouseEvent returns null when point is not mapped', () => {
    const adapter = makeAdapter()
    expect(getLineFromMouseEvent(adapter, { clientX: 0, clientY: 0 } as MouseEvent)).toBeNull()
  })
})

describe('EditorView geometry helpers', () => {
  it('viewCoordsAtPos does not throw and handles invisible positions', () => {
    const view = createView('hello world')
    expect(() => viewCoordsAtPos(view, 0)).not.toThrow()
    // happy-dom has no layout, so coords are typically not available
    expect(viewCoordsAtPos(view, 0)).toBeNull()
    view.destroy()
  })

  it('viewPosAtCoords does not throw and returns a number or null', () => {
    const view = createView('hello world')
    expect(() => viewPosAtCoords(view, { x: -100, y: -100 })).not.toThrow()
    const result = viewPosAtCoords(view, { x: -100, y: -100 })
    expect(result === null || typeof result === 'number').toBe(true)
    view.destroy()
  })

  it('viewSelectionRect returns null when coordinates are unavailable', () => {
    const view = createView('hello world')
    expect(viewSelectionRect(view, { anchor: 0, head: 5 })).toBeNull()
    view.destroy()
  })

  it('viewLineFromMouseEvent does not throw and returns a number or null', () => {
    const view = createView('hello\nworld')
    expect(() => viewLineFromMouseEvent(view, { clientX: -10, clientY: -10 } as MouseEvent)).not.toThrow()
    const result = viewLineFromMouseEvent(view, { clientX: -10, clientY: -10 } as MouseEvent)
    expect(result === null || typeof result === 'number').toBe(true)
    view.destroy()
  })

  it('viewCoordsAtPos clamps out-of-range positions', () => {
    const view = createView('hi')
    expect(() => viewCoordsAtPos(view, -5)).not.toThrow()
    expect(() => viewCoordsAtPos(view, 9999)).not.toThrow()
    view.destroy()
  })
})

describe('constrainRectToViewport', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  })

  it('keeps rect inside viewport with default padding', () => {
    const result = constrainRectToViewport({ left: 100, top: 100, width: 200, height: 100 })
    expect(result).toEqual({ left: 100, top: 100 })
  })

  it('clamps rect overflowing right edge', () => {
    const result = constrainRectToViewport(
      { left: 900, top: 100, width: 200, height: 100 },
      { right: 8 },
    )
    expect(result.left).toBe(1000 - 200 - 8)
    expect(result.top).toBe(100)
  })

  it('clamps rect overflowing bottom edge', () => {
    const result = constrainRectToViewport(
      { left: 100, top: 750, width: 200, height: 100 },
      { bottom: 8 },
    )
    expect(result.left).toBe(100)
    expect(result.top).toBe(800 - 100 - 8)
  })

  it('clamps rect overflowing left and top edges', () => {
    const result = constrainRectToViewport(
      { left: -50, top: -30, width: 200, height: 100 },
      { left: 8, top: 8 },
    )
    expect(result.left).toBe(8)
    expect(result.top).toBe(8)
  })
})
