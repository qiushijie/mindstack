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
  // Load a document into the editor. When the path was previously opened,
  // restores its prior editor state (undo/redo history and selection);
  // otherwise builds a fresh state for `content`.
  loadDocument(path: string, content: string): void
  // Forget cached editor state for a path that is no longer open.
  removeDocument(path: string): void
  // Forget all cached editor state.
  clearDocuments(): void
  // Re-key cached editor state when a document's path changes (e.g. an
  // untitled buffer saved to a real path), preserving undo/redo history.
  renameDocument(oldPath: string, newPath: string): void

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
