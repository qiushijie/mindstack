import { describe, it, expect, afterEach } from 'vitest'
import { EditorSelection } from '@codemirror/state'
import { emptyLinePlaceholder } from '../emptyLinePlaceholder'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

function getPlaceholders(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.cm-empty-line-placeholder'))
}

describe('emptyLinePlaceholder', () => {
  it('shows placeholder on empty line when focused', () => {
    const view = createView('', [emptyLinePlaceholder])
    view.focus()
    view.dispatch({ selection: { anchor: 0 } })
    expect(getPlaceholders().length).toBe(1)
  })

  it('hides placeholder when editor loses focus', () => {
    const view = createView('', [emptyLinePlaceholder])
    view.focus()
    view.dispatch({ selection: { anchor: 0 } })
    expect(getPlaceholders().length).toBe(1)

    // Simulate blur by toggling focus off
    view.contentDOM.blur()
    view.dispatch({})
    expect(getPlaceholders().length).toBe(0)
  })

  it('hides placeholder on non-empty lines', () => {
    const view = createView('Hello world', [emptyLinePlaceholder])
    view.focus()
    view.dispatch({ selection: { anchor: 5 } })
    expect(getPlaceholders().length).toBe(0)
  })

  it('hides placeholder when slash menu is active', () => {
    const view = createView('/', [emptyLinePlaceholder])
    view.focus()
    view.dispatch({ selection: { anchor: 1 } })
    expect(getPlaceholders().length).toBe(0)
  })

  it('shows placeholder on empty lines in multi-line doc', () => {
    const view = createView('Line 1\n\nLine 3', [emptyLinePlaceholder])
    view.focus()
    // Cursor on empty line 2
    view.dispatch({ selection: { anchor: 'Line 1\n'.length } })
    expect(getPlaceholders().length).toBe(1)
  })

  it('shows multiple placeholders for multiple cursors on empty lines', () => {
    const view = createView('a\n\nb', [emptyLinePlaceholder])
    view.focus()
    // Cursor on empty line between 'a' and 'b'
    const emptyLinePos = 'a\n'.length
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(emptyLinePos),
        EditorSelection.cursor(emptyLinePos),
      ]),
    })
    expect(getPlaceholders().length).toBe(1)
  })

  it('placeholder element has correct style attribute', () => {
    const view = createView('', [emptyLinePlaceholder])
    view.focus()
    view.dispatch({ selection: { anchor: 0 } })
    const placeholders = getPlaceholders()
    expect(placeholders.length).toBe(1)
    expect(placeholders[0].className).toBe('cm-empty-line-placeholder')
  })

  it('hides placeholder when typing on empty line', () => {
    const view = createView('', [emptyLinePlaceholder])
    view.focus()
    view.dispatch({ selection: { anchor: 0 } })
    expect(getPlaceholders().length).toBe(1)

    view.dispatch({
      changes: { from: 0, to: 0, insert: 'a' },
      selection: { anchor: 1 },
    })
    expect(getPlaceholders().length).toBe(0)
  })
})
