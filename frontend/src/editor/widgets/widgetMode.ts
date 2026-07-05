export interface WidgetRange {
  from: number
  to: number
}

export interface SelectionRange {
  from: number
  to: number
}

export function selectionIntersectsRange(selection: SelectionRange, range: WidgetRange): boolean {
  return selection.from < range.to && selection.to > range.from
}

export function selectionInsideRange(selection: SelectionRange, range: WidgetRange): boolean {
  return selection.from >= range.from && selection.to <= range.to
}

export function cursorInsideRange(cursor: number, range: WidgetRange): boolean {
  return cursor >= range.from && cursor < range.to
}

export function rangesOverlap(a: WidgetRange, b: WidgetRange): boolean {
  return a.from < b.to && a.to > b.from
}

export function widgetEditingState(selection: SelectionRange, range: WidgetRange): 'editing' | 'preview' {
  return selectionIntersectsRange(selection, range) ? 'editing' : 'preview'
}
