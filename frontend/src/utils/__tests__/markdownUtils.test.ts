import { describe, it, expect, afterEach } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { wrapInline, toggleBlockType, insertLink, toggleCheckbox, moveLines } from '../markdownUtils'
import { createView } from '../../test-utils/helpers'

function dispatchAndCheck(
  initialDoc: string,
  selection: { anchor: number; head?: number },
  fn: (view: EditorView) => boolean,
  expectedDoc: string,
): boolean {
  const view = createView(initialDoc)
  // Set selection
  view.dispatch({ selection: { anchor: selection.anchor, head: selection.head ?? selection.anchor } })
  const result = fn(view)
  if (!result) return false
  return view.state.doc.toString() === expectedDoc
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('wrapInline', () => {
  it('wraps selected text with **', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    wrapInline('**', '**')(view)
    expect(view.state.doc.toString()).toBe('Hello **World**')
  })

  it('unwraps ** on toggle', () => {
    const view = createView('Hello **World**')
    view.dispatch({ selection: { anchor: 8, head: 13 } })
    wrapInline('**', '**')(view)
    expect(view.state.doc.toString()).toBe('Hello World')
  })

  it('wraps with * for italic', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    wrapInline('*', '*')(view)
    expect(view.state.doc.toString()).toBe('Hello *World*')
  })

  it('wraps with ~~ for strikethrough', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    wrapInline('~~', '~~')(view)
    expect(view.state.doc.toString()).toBe('Hello ~~World~~')
  })

  it('inserts empty marks when no selection', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 5 } })
    wrapInline('**', '**')(view)
    expect(view.state.doc.toString()).toBe('Hello**** World')
  })
})

describe('toggleBlockType', () => {
  it('converts paragraph to h1', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('# ')(view)
    expect(view.state.doc.toString()).toBe('# Hello World')
  })

  it('removes h1 prefix on toggle off', () => {
    const view = createView('# Hello World')
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('# ')(view)
    expect(view.state.doc.toString()).toBe('Hello World')
  })

  it('converts paragraph to bullet list', () => {
    const view = createView('Item text')
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('- ')(view)
    expect(view.state.doc.toString()).toBe('- Item text')
  })

  it('converts paragraph to blockquote', () => {
    const view = createView('Quote text')
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('> ')(view)
    expect(view.state.doc.toString()).toBe('> Quote text')
  })

  it('converts h1 to bullet list', () => {
    const view = createView('# Title')
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('- ')(view)
    expect(view.state.doc.toString()).toBe('- Title')
  })

  it('removes bullet list prefix on toggle off', () => {
    const view = createView('- Item')
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('- ')(view)
    expect(view.state.doc.toString()).toBe('Item')
  })

  it('handles empty line', () => {
    const view = createView('')
    view.dispatch({ selection: { anchor: 0 } })
    toggleBlockType('# ')(view)
    expect(view.state.doc.toString()).toBe('# ')
  })
})

describe('insertLink', () => {
  it('wraps selected text as link', () => {
    const view = createView('Click here')
    view.dispatch({ selection: { anchor: 0, head: 10 } })
    insertLink(view)
    const doc = view.state.doc.toString()
    expect(doc).toContain('[Click here]')
    expect(doc).toContain('(url)')
  })

  it('inserts link template when no selection', () => {
    const view = createView('Hello ')
    view.dispatch({ selection: { anchor: 6 } })
    insertLink(view)
    const doc = view.state.doc.toString()
    expect(doc).toContain('[link text]')
    expect(doc).toContain('(url)')
  })
})

describe('toggleCheckbox', () => {
  it('toggles unchecked to checked', () => {
    const view = createView('- [ ] Task')
    view.dispatch({ selection: { anchor: 5 } })
    toggleCheckbox(view)
    expect(view.state.doc.toString()).toBe('- [x] Task')
  })

  it('toggles checked to unchecked', () => {
    const view = createView('- [x] Task')
    view.dispatch({ selection: { anchor: 5 } })
    toggleCheckbox(view)
    expect(view.state.doc.toString()).toBe('- [ ] Task')
  })

  it('returns false for non-task line', () => {
    const view = createView('Just text')
    view.dispatch({ selection: { anchor: 5 } })
    expect(toggleCheckbox(view)).toBe(false)
  })
})

describe('moveLines', () => {
  it('moves a block down past another', () => {
    const result = moveLines('# Heading\n\nParagraph\n\n- List', 1, 1, 4)
    expect(result).toBe('\nParagraph\n# Heading\n\n- List')
  })

  it('moves a block up before another', () => {
    const result = moveLines('# Heading\n\nParagraph\n\n- List', 3, 3, 1)
    expect(result).toBe('Paragraph\n# Heading\n\n\n- List')
  })

  it('moves a multi-line block (code fence)', () => {
    const result = moveLines('```\ncode\n```\n\n- Item', 1, 3, 6)
    expect(result).toBe('\n- Item\n```\ncode\n```')
  })

  it('no-op when target equals source', () => {
    const original = '# Heading\n\nParagraph'
    const result = moveLines(original, 1, 1, 1)
    expect(result).toBe(original)
  })

  it('moves last block to top', () => {
    const result = moveLines('A\n\nB\n\nC', 5, 5, 1)
    expect(result).toBe('C\nA\n\nB')
  })

  it('moves first block to bottom', () => {
    const result = moveLines('A\n\nB\n\nC', 1, 1, 6)
    expect(result).toBe('\nB\n\nC\nA')
  })

  it('handles two-line document', () => {
    expect(moveLines('A\nB', 2, 2, 1)).toBe('B\nA')
  })

  it('handles single line', () => {
    expect(moveLines('Hello', 1, 1, 1)).toBe('Hello')
  })

  it('preserves trailing newline', () => {
    expect(moveLines('A\nB\n', 1, 1, 3).endsWith('\n')).toBe(true)
  })

  it('moves multi-line block up', () => {
    const result = moveLines('A\n\n```\ncode\n```\n\nB', 3, 5, 1)
    expect(result).toBe('```\ncode\n```\nA\n\n\nB')
  })

  it('handles moving block to same position via target greater than source', () => {
    const result = moveLines('A\nB\nC', 1, 1, 2)
    expect(result).toBe('A\nB\nC')
  })
})
