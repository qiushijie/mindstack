import type {
  EditorAdapter,
  EditorSelection,
  EditorChange,
  CursorPosition,
  EditorStats,
  SearchMatchInfo,
  EditorLine,
} from '../../EditorAdapter'

export class MockEditorAdapter implements EditorAdapter {
  private _content: string
  private _selection: EditorSelection
  private _focusCount = 0
  private _replaceRangeCalls: { change: EditorChange; options?: { selection?: EditorSelection } }[] = []

  constructor(content = '', selection: EditorSelection = { anchor: 0, head: 0 }) {
    this._content = content
    this._selection = { ...selection }
  }

  getContent(): string {
    return this._content
  }

  setContent(content: string, options?: { preserveSelection?: boolean }): void {
    this._content = content
    if (!options?.preserveSelection) {
      this._selection = { anchor: 0, head: 0 }
    } else {
      this._selection = this.clampSelection(this._selection)
    }
  }

  getSelection(): EditorSelection {
    return { ...this._selection }
  }

  setSelection(selection: { anchor: number; head?: number }): void {
    this._selection = {
      anchor: this.clampPosition(selection.anchor),
      head: this.clampPosition(selection.head ?? selection.anchor),
    }
  }

  getSelectedText(): string | null {
    const { anchor, head } = this._selection
    if (anchor === head) return null
    const [from, to] = anchor < head ? [anchor, head] : [head, anchor]
    return this._content.slice(from, to)
  }

  replaceRange(change: EditorChange, options?: { selection?: { anchor: number; head?: number } }): void {
    const normalizedOptions = options?.selection
      ? { selection: { anchor: options.selection.anchor, head: options.selection.head ?? options.selection.anchor } }
      : undefined
    this._replaceRangeCalls.push({ change: { ...change }, options: normalizedOptions })
    const from = this.clampPosition(change.from)
    const to = this.clampPosition(change.to)
    this._content = this._content.slice(0, from) + change.insert + this._content.slice(to)
    if (options?.selection) {
      this._selection = {
        anchor: this.clampPosition(options.selection.anchor),
        head: this.clampPosition(options.selection.head ?? options.selection.anchor),
      }
    }
  }

  focus(): void {
    this._focusCount++
  }

  moveCursorToEnd(): void {
    this._selection = { anchor: this._content.length, head: this._content.length }
  }

  scrollToLine(_lineNumber: number): void {
    // no-op in mock
  }

  coordsAtPos(_pos: number): DOMRect | null {
    return null
  }

  posAtCoords(_point: { x: number; y: number }): number | null {
    return null
  }

  getDOM(): HTMLElement | null {
    return null
  }

  getCursorPosition(): CursorPosition {
    const textBefore = this._content.slice(0, this._selection.head)
    const lines = textBefore.split('\n')
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    }
  }

  getLineAt(pos: number): EditorLine {
    const clamped = this.clampPosition(pos)
    const textBefore = this._content.slice(0, clamped)
    const lineNumber = textBefore.split('\n').length
    const lines = this._content.split('\n')
    const text = lines[lineNumber - 1] ?? ''
    let from = 0
    for (let i = 0; i < lineNumber - 1; i++) {
      from += lines[i].length + 1
    }
    return { number: lineNumber, from, to: from + text.length, text }
  }

  getLine(lineNumber: number): EditorLine | null {
    const lines = this._content.split('\n')
    if (lineNumber < 1 || lineNumber > lines.length) return null
    const text = lines[lineNumber - 1]
    let from = 0
    for (let i = 0; i < lineNumber - 1; i++) {
      from += lines[i].length + 1
    }
    return { number: lineNumber, from, to: from + text.length, text }
  }

  getStats(): EditorStats {
    const text = this._content
    let words = 0
    let inWord = false
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i)
      const isSpace = ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 12
      if (!isSpace && !inWord) {
        words++
        inWord = true
      } else if (isSpace) {
        inWord = false
      }
    }
    return { chars: this._content.length, words }
  }

  setSearchQuery(_query: { search: string; caseSensitive?: boolean }): void {
    // no-op in mock
  }

  clearSearchQuery(): void {
    // no-op in mock
  }

  findNext(): boolean {
    return false
  }

  findPrevious(): boolean {
    return false
  }

  getSearchMatchInfo(): SearchMatchInfo | null {
    return { current: 0, total: 0 }
  }

  get focusCount(): number {
    return this._focusCount
  }

  get replaceRangeCalls(): { change: EditorChange; options?: { selection?: EditorSelection } }[] {
    return this._replaceRangeCalls
  }

  private clampPosition(pos: number): number {
    if (pos < 0) return 0
    if (pos > this._content.length) return this._content.length
    return pos
  }

  private clampSelection(selection: EditorSelection): EditorSelection {
    return {
      anchor: this.clampPosition(selection.anchor),
      head: this.clampPosition(selection.head),
    }
  }
}
