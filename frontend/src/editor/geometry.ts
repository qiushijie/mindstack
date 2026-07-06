import type { EditorView } from '@codemirror/view'
import type { EditorAdapter, EditorSelection } from './EditorAdapter'

export interface Point {
  x: number
  y: number
}

export interface ViewportPadding {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

function normalizeViewportPadding(padding?: ViewportPadding): Required<ViewportPadding> {
  return {
    left: padding?.left ?? 0,
    right: padding?.right ?? 0,
    top: padding?.top ?? 0,
    bottom: padding?.bottom ?? 0,
  }
}

function normalizeCoords(rect: {
  left: number
  right: number
  top: number
  bottom: number
}): DOMRect {
  return new DOMRect(
    rect.left,
    rect.top,
    rect.right - rect.left,
    rect.bottom - rect.top,
  )
}

function clampPosition(length: number, pos: number): number {
  if (pos < 0) return 0
  if (pos > length) return length
  return pos
}

function unionRects(a: DOMRect, b: DOMRect): DOMRect {
  const left = Math.min(a.left, b.left)
  const top = Math.min(a.top, b.top)
  const right = Math.max(a.right, b.right)
  const bottom = Math.max(a.bottom, b.bottom)
  return new DOMRect(left, top, right - left, bottom - top)
}

// ---- adapter-first entry points used by UI components ----

export function safeCoordsAtPos(adapter: EditorAdapter, pos: number): DOMRect | null {
  try {
    return adapter.coordsAtPos(pos)
  } catch {
    return null
  }
}

export function safePosAtCoords(adapter: EditorAdapter, point: Point): number | null {
  try {
    return adapter.posAtCoords?.(point) ?? null
  } catch {
    return null
  }
}

export function getSelectionRect(
  adapter: EditorAdapter,
  selection: EditorSelection,
): DOMRect | null {
  const fromRect = safeCoordsAtPos(adapter, selection.anchor)
  const toRect = safeCoordsAtPos(adapter, selection.head)
  if (!fromRect || !toRect) return null

  return unionRects(fromRect, toRect)
}

export function getLineFromMouseEvent(
  adapter: EditorAdapter,
  event: MouseEvent,
): number | null {
  const pos = safePosAtCoords(adapter, { x: event.clientX, y: event.clientY })
  if (pos == null) return null

  try {
    return adapter.getLineAt(pos).number
  } catch {
    return null
  }
}

// ---- EditorView entry points used inside CodeMirror extensions ----

export function viewCoordsAtPos(view: EditorView, pos: number): DOMRect | null {
  try {
    const rect = view.coordsAtPos(clampPosition(view.state.doc.length, pos))
    if (!rect) return null
    return normalizeCoords(rect)
  } catch {
    return null
  }
}

export function viewPosAtCoords(view: EditorView, point: Point): number | null {
  try {
    return view.posAtCoords(point) ?? null
  } catch {
    return null
  }
}

export function viewSelectionRect(
  view: EditorView,
  selection: { anchor: number; head: number },
): DOMRect | null {
  const fromRect = viewCoordsAtPos(view, selection.anchor)
  const toRect = viewCoordsAtPos(view, selection.head)
  if (!fromRect || !toRect) return null

  return unionRects(fromRect, toRect)
}

export function viewLineFromMouseEvent(
  view: EditorView,
  event: MouseEvent,
): number | null {
  const pos = viewPosAtCoords(view, { x: event.clientX, y: event.clientY })
  if (pos == null) return null

  try {
    return view.state.doc.lineAt(pos).number
  } catch {
    return null
  }
}

// ---- shared layout utilities ----

export function constrainRectToViewport(
  desired: { left: number; top: number; width: number; height: number },
  padding?: ViewportPadding,
): { left: number; top: number } {
  const pad = normalizeViewportPadding(padding)
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const minLeft = pad.left
  const maxLeft = viewportWidth - desired.width - pad.right
  const minTop = pad.top
  const maxTop = viewportHeight - desired.height - pad.bottom

  return {
    left: Math.max(minLeft, Math.min(desired.left, maxLeft)),
    top: Math.max(minTop, Math.min(desired.top, maxTop)),
  }
}
