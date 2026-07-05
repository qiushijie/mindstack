import { EditorView } from '@codemirror/view'
import {
  setSearchQuery,
  getSearchQuery,
  findNext,
  findPrevious,
  SearchQuery,
} from '@codemirror/search'
import type {
  EditorAdapter,
  EditorSelection,
  EditorChange,
  CursorPosition,
  EditorStats,
  SearchMatchInfo,
  EditorLine,
} from '../EditorAdapter'

export class CodeMirrorAdapter implements EditorAdapter {
  constructor(private readonly view: EditorView) {}

  getContent(): string {
    return this.view.state.doc.toString()
  }

  setContent(content: string, options?: { preserveSelection?: boolean }): void {
    const oldSelection = this.view.state.selection.main
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content },
      selection: options?.preserveSelection
        ? this.clampSelection(oldSelection, content.length)
        : { anchor: 0 },
    })
  }

  getSelection(): EditorSelection {
    const sel = this.view.state.selection.main
    return { anchor: sel.anchor, head: sel.head }
  }

  setSelection(
    selection: { anchor: number; head?: number },
    options?: { scroll?: boolean },
  ): void {
    const anchor = this.clampPosition(selection.anchor)
    const head = selection.head !== undefined ? this.clampPosition(selection.head) : anchor
    const effect = options?.scroll
      ? EditorView.scrollIntoView(anchor, { y: 'center' })
      : undefined
    this.view.dispatch({
      selection: { anchor, head },
      effects: effect,
    })
  }

  getSelectedText(): string | null {
    const sel = this.view.state.selection.main
    if (sel.empty) return null
    return this.view.state.sliceDoc(sel.from, sel.to)
  }

  replaceRange(
    change: EditorChange,
    options?: { selection?: { anchor: number; head?: number } },
  ): void {
    const oldLength = this.view.state.doc.length
    const from = this.clampPosition(change.from)
    const to = this.clampPosition(change.to)
    const newLength = oldLength - (to - from) + change.insert.length
    const selection = options?.selection
      ? {
          anchor: this.clampPosition(options.selection.anchor, newLength),
          head:
            options.selection.head !== undefined
              ? this.clampPosition(options.selection.head, newLength)
              : this.clampPosition(options.selection.anchor, newLength),
        }
      : undefined
    this.view.dispatch({
      changes: {
        from,
        to,
        insert: change.insert,
      },
      selection,
    })
  }

  focus(): void {
    this.view.focus()
  }

  moveCursorToEnd(): void {
    const end = this.view.state.doc.length
    this.view.dispatch({ selection: { anchor: end } })
  }

  scrollToLine(lineNumber: number): void {
    try {
      const line = this.view.state.doc.line(lineNumber)
      this.view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
      })
    } catch {
      // ignore invalid line numbers
    }
  }

  coordsAtPos(pos: number): DOMRect | null {
    const rect = this.view.coordsAtPos(this.clampPosition(pos))
    if (!rect) return null
    return new DOMRect(
      rect.left,
      rect.top,
      rect.right - rect.left,
      rect.bottom - rect.top,
    )
  }

  posAtCoords(point: { x: number; y: number }): number | null {
    const pos = this.view.posAtCoords(point)
    return pos ?? null
  }

  getDOM(): HTMLElement | null {
    return this.view.dom
  }

  getCursorPosition(): CursorPosition {
    const pos = this.view.state.selection.main.head
    const lineInfo = this.view.state.doc.lineAt(pos)
    return {
      line: lineInfo.number,
      column: pos - lineInfo.from + 1,
    }
  }

  getLineAt(pos: number): EditorLine {
    const line = this.view.state.doc.lineAt(this.clampPosition(pos))
    return {
      number: line.number,
      from: line.from,
      to: line.to,
      text: this.view.state.doc.sliceString(line.from, line.to),
    }
  }

  getLine(lineNumber: number): EditorLine | null {
    try {
      const line = this.view.state.doc.line(lineNumber)
      return {
        number: line.number,
        from: line.from,
        to: line.to,
        text: this.view.state.doc.sliceString(line.from, line.to),
      }
    } catch {
      return null
    }
  }

  getStats(): EditorStats {
    const text = this.view.state.doc.toString()
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
    return { chars: this.view.state.doc.length, words }
  }

  setSearchQuery(query: { search: string; caseSensitive?: boolean }): void {
    this.view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: query.search, caseSensitive: query.caseSensitive ?? false })),
    })
  }

  clearSearchQuery(): void {
    this.view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: '' })),
    })
  }

  findNext(): boolean {
    return findNext(this.view)
  }

  findPrevious(): boolean {
    return findPrevious(this.view)
  }

  getSearchMatchInfo(): SearchMatchInfo | null {
    const query = getSearchQuery(this.view.state)
    if (!query?.search) {
      return { current: 0, total: 0 }
    }

    const cursor = this.view.state.selection.main.head
    const matches: { from: number }[] = []
    const iter = query.getCursor(this.view.state.doc)
    while (true) {
      const result = iter.next()
      if (result.done) break
      matches.push({ from: result.value.from })
    }

    const total = matches.length
    if (total === 0) {
      return { current: 0, total: 0 }
    }

    let current = 1
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].from <= cursor) current = i + 1
    }
    return { current, total }
  }

  private clampPosition(pos: number, length?: number): number {
    const len = length ?? this.view.state.doc.length
    if (pos < 0) return 0
    if (pos > len) return len
    return pos
  }

  private clampSelection(
    selection: { anchor: number; head: number },
    length?: number,
  ): { anchor: number; head: number } {
    return {
      anchor: this.clampPosition(selection.anchor, length),
      head: this.clampPosition(selection.head, length),
    }
  }
}
