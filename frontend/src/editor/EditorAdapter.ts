export interface EditorSelection {
  anchor: number
  head: number
}

export interface EditorRange {
  from: number
  to: number
}

export interface EditorChange extends EditorRange {
  insert: string
}

export interface CursorPosition {
  line: number
  column: number
}

export interface EditorStats {
  chars: number
  words: number
}

export interface SearchMatchInfo {
  current: number
  total: number
}

export interface EditorLine {
  number: number
  from: number
  to: number
  text: string
}

export interface EditorAdapter {
  // Content
  getContent(): string
  setContent(content: string, options?: { preserveSelection?: boolean }): void

  // Selection and replacement
  getSelection(): EditorSelection
  setSelection(selection: { anchor: number; head?: number }, options?: { scroll?: boolean }): void
  getSelectedText(): string | null
  replaceRange(
    change: EditorChange,
    options?: { selection?: { anchor: number; head?: number }; isolateHistory?: 'before' | 'after' },
  ): void

  // Focus, scroll and geometry
  focus(): void
  moveCursorToEnd(): void
  scrollToLine(lineNumber: number): void
  coordsAtPos(pos: number): DOMRect | null
  posAtCoords?(point: { x: number; y: number }): number | null
  getDOM(): HTMLElement | null

  // Status
  getCursorPosition(): CursorPosition
  getLineAt(pos: number): EditorLine
  getLine(lineNumber: number): EditorLine | null
  getStats(): EditorStats

  // Search
  setSearchQuery(query: { search: string; caseSensitive?: boolean }): void
  clearSearchQuery(): void
  findNext(): boolean
  findPrevious(): boolean
  getSearchMatchInfo(): SearchMatchInfo | null
}
