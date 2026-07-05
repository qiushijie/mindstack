import { describe, it, expect, afterEach, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import katex from 'katex'
import { mathPlugin, mathEditHandler, MathWidget, scanMathRanges } from '../mathWidget'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

// --- scanMathRanges ---

const md = () => markdown({ extensions: GFM })

function createState(doc: string) {
  return EditorState.create({ doc, extensions: [md()] })
}

describe('scanMathRanges', () => {
  it('detects inline math $...$', () => {
    const state = createState('The $E=mc^2$ formula')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      from: 4,
      to: 12,
      content: 'E=mc^2',
      isBlock: false,
    })
  })

  it('detects block math $$...$$', () => {
    const doc = '$$\nE=mc^2\n$$'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      from: 0,
      to: doc.length,
      content: 'E=mc^2',
      isBlock: true,
    })
  })

  it('detects multiple inline formulas', () => {
    const state = createState('$a$ and $b$')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].content).toBe('a')
    expect(ranges[1].content).toBe('b')
  })

  it('detects multiple block formulas', () => {
    const doc = '$$a$$\n\n$$b$$'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].content).toBe('a')
    expect(ranges[1].content).toBe('b')
  })

  it('ignores $ followed by space', () => {
    const state = createState('Price is $ 100')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('ignores inline formula when closing $ preceded by space', () => {
    const state = createState('$a $')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('handles empty inline formula', () => {
    const state = createState('$$')
    const ranges = scanMathRanges(state)
    // $$ is block math start, but no closing $$ — should find nothing
    expect(ranges).toHaveLength(0)
  })

  it('handles single $ at end of document', () => {
    const state = createState('text $')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('handles unclosed inline math', () => {
    const state = createState('$unclosed')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('handles unclosed block math', () => {
    const state = createState('$$\nunclosed')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('trims block math content', () => {
    const doc = '$$\n  a + b  \n$$'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].content).toBe('a + b')
  })

  it('does not treat $ inside block math as inline', () => {
    const doc = '$$\na $ b\n$$'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].isBlock).toBe(true)
    expect(ranges[0].content).toBe('a $ b')
  })

  it('handles adjacent block and inline math', () => {
    const doc = '$a$\n$$b$$'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].isBlock).toBe(false)
    expect(ranges[0].content).toBe('a')
    expect(ranges[1].isBlock).toBe(true)
    expect(ranges[1].content).toBe('b')
  })

  it('returns empty array for plain text', () => {
    const state = createState('Just plain text without any math')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('ignores $ inside fenced code block', () => {
    const doc = '```sql\nSELECT * FROM t WHERE id = $1 ORDER BY id LIMIT $2;\n```'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('ignores $ inside inline code', () => {
    const state = createState('Use `$1` and `$2` as placeholders')
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(0)
  })

  it('detects math outside code blocks', () => {
    const doc = '```sql\nSELECT $1;\n```\n\nThe formula $E=mc^2$ is famous.'
    const state = createState(doc)
    const ranges = scanMathRanges(state)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].content).toBe('E=mc^2')
    expect(ranges[0].isBlock).toBe(false)
  })
})

// --- MathWidget ---

const mockView = { dispatch: () => {}, focus: () => {} } as unknown as EditorView

describe('MathWidget', () => {
  it('toDOM creates span for inline math', () => {
    const widget = new MathWidget('E=mc^2', false, 10)
    const dom = widget.toDOM(mockView)
    expect(dom.tagName).toBe('SPAN')
    expect(dom.className).toBe('cm-math-inline')
    expect(dom.getAttribute('contenteditable')).toBe('false')
    expect(dom.dataset.pos).toBe('10')
  })

  it('toDOM creates div for block math', () => {
    const widget = new MathWidget('E=mc^2', true, 20)
    const dom = widget.toDOM(mockView)
    expect(dom.tagName).toBe('DIV')
    expect(dom.className).toBe('cm-math-block')
    expect(dom.getAttribute('contenteditable')).toBe('false')
    expect(dom.dataset.pos).toBe('20')
  })

  it('toDOM renders valid KaTeX for inline math', () => {
    const widget = new MathWidget('x^2', false, 0)
    const dom = widget.toDOM(mockView)
    expect(dom.querySelector('.katex')).not.toBeNull()
  })

  it('toDOM renders valid KaTeX for block math', () => {
    const widget = new MathWidget('\\sum_{i=1}^n i', true, 0)
    const dom = widget.toDOM(mockView)
    expect(dom.querySelector('.katex-display')).not.toBeNull()
  })

  it('toDOM falls back to plain text on KaTeX error', () => {
    const original = katex.renderToString
    katex.renderToString = () => { throw new Error('mock katex error') }
    const widget = new MathWidget('x', false, 0)
    const dom = widget.toDOM(mockView)
    expect(dom.classList.contains('cm-math-error')).toBe(true)
    expect(dom.textContent).toBe('x')
    katex.renderToString = original
  })

  it('eq returns true for identical widgets', () => {
    const a = new MathWidget('a', false, 0)
    const b = new MathWidget('a', false, 0)
    expect(a.eq(b)).toBe(true)
  })

  it('eq returns false for different content', () => {
    const a = new MathWidget('a', false, 0)
    const b = new MathWidget('b', false, 0)
    expect(a.eq(b)).toBe(false)
  })

  it('eq returns false for different isBlock', () => {
    const a = new MathWidget('a', false, 0)
    const b = new MathWidget('a', true, 0)
    expect(a.eq(b)).toBe(false)
  })

  it('eq returns false for different pos', () => {
    const a = new MathWidget('a', false, 0)
    const b = new MathWidget('a', false, 1)
    expect(a.eq(b)).toBe(false)
  })

  it('ignoreEvent returns false', () => {
    const widget = new MathWidget('a', false, 0)
    expect(widget.ignoreEvent()).toBe(false)
  })
})

// --- mathPlugin StateField ---

describe('mathPlugin', () => {
  it('creates decoration for inline math', () => {
    const view = createView('The $E=mc^2$ formula', [mathPlugin])
    const deco = view.state.field(mathPlugin).decorations

    let count = 0
    deco.between(0, view.state.doc.length, () => { count++ })
    expect(count).toBe(1)
    view.destroy()
  })

  it('creates decoration for block math', () => {
    const doc = '$$\nE=mc^2\n$$'
    const view = createView(doc, [mathPlugin])
    const deco = view.state.field(mathPlugin).decorations

    let count = 0
    deco.between(0, doc.length, () => { count++ })
    expect(count).toBe(1)
    view.destroy()
  })

  it('skips decoration when selection overlaps inline math', () => {
    const doc = 'The $E=mc^2$ formula'
    const view = createView(doc, [mathPlugin])
    // Place selection inside the math range (from 4 to 13)
    view.dispatch({ selection: { anchor: 5, head: 8 } })

    const deco = view.state.field(mathPlugin).decorations
    let count = 0
    deco.between(0, doc.length, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('skips decoration when selection overlaps block math', () => {
    const doc = '$$\nE=mc^2\n$$'
    const view = createView(doc, [mathPlugin])
    view.dispatch({ selection: { anchor: 2, head: 5 } })

    const deco = view.state.field(mathPlugin).decorations
    let count = 0
    deco.between(0, doc.length, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('still decorates non-overlapping math when cursor is elsewhere', () => {
    const doc = '$a$ text $b$'
    const view = createView(doc, [mathPlugin])
    // Cursor inside first math
    view.dispatch({ selection: { anchor: 2, head: 2 } })

    const deco = view.state.field(mathPlugin).decorations
    let count = 0
    deco.between(0, doc.length, () => { count++ })
    // First math overlaps, second math does not
    expect(count).toBe(1)
    view.destroy()
  })

  it('no decoration for text without math', () => {
    const view = createView('Hello world', [mathPlugin])
    const deco = view.state.field(mathPlugin).decorations
    let count = 0
    deco.between(0, 11, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('updates decorations when document changes', () => {
    const view = createView('Hello', [mathPlugin])
    let deco = view.state.field(mathPlugin).decorations
    let count1 = 0
    deco.between(0, 5, () => { count1++ })
    expect(count1).toBe(0)

    // Add math
    view.dispatch({ changes: { from: 5, to: 5, insert: ' $a$' } })
    deco = view.state.field(mathPlugin).decorations
    let count2 = 0
    deco.between(0, 9, () => { count2++ })
    expect(count2).toBe(1)
    view.destroy()
  })

  it('decoration spec has block=true for block math', () => {
    const doc = '$$\na\n$$'
    const view = createView(doc, [mathPlugin])
    const deco = view.state.field(mathPlugin).decorations

    let isBlock = false
    deco.between(0, doc.length, (_from, _to, dec) => {
      isBlock = dec.spec.block === true
    })
    expect(isBlock).toBe(true)
    view.destroy()
  })

  it('decoration spec has block=false for inline math', () => {
    const doc = '$a$'
    const view = createView(doc, [mathPlugin])
    const deco = view.state.field(mathPlugin).decorations

    let isBlock = true
    deco.between(0, doc.length, (_from, _to, dec) => {
      isBlock = dec.spec.block === true
    })
    expect(isBlock).toBe(false)
    view.destroy()
  })

  it('does not rebuild decorations when selection moves outside math ranges', () => {
    const doc = '$a$ text $b$'
    const view = createView(doc, [mathPlugin])
    // Cursor at start (outside both math ranges)
    view.dispatch({ selection: { anchor: 0 } })

    const state1 = view.state.field(mathPlugin)
    const deco1 = state1.decorations
    let count1 = 0
    deco1.between(0, doc.length, () => { count1++ })
    expect(count1).toBe(2)

    // Move cursor but stay outside math
    view.dispatch({ selection: { anchor: 7 } })

    const state2 = view.state.field(mathPlugin)
    const deco2 = state2.decorations
    let count2 = 0
    deco2.between(0, doc.length, () => { count2++ })
    expect(count2).toBe(2)
    expect(deco2).toBe(deco1)
    expect(state2).toBe(state1)
    view.destroy()
  })
})

// --- mathEditHandler ---

describe('mathEditHandler', () => {
  it('registers as an extension without error', () => {
    // domEventHandlers relies on CodeMirror view event delegation,
    // which does not work reliably in happy-dom. We verify the
    // extension itself can be instantiated.
    const view = createView('$a$', [mathEditHandler])
    expect(view).toBeTruthy()
    view.destroy()
  })
})
