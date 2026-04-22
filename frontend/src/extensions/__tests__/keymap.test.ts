import { describe, it, expect, afterEach } from 'vitest'
import { runScopeHandlers } from '@codemirror/view'
import { createKeymapExtension } from '../keymap'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * happy-dom reports navigator.platform as "X11; Darwin arm64",
 * which causes CM6 to treat Mod as Ctrl (not Meta).
 * Use ctrlKey for Mod-based shortcuts.
 */

describe('createKeymapExtension', () => {
  it('returns an extension (not undefined)', () => {
    const ext = createKeymapExtension()
    expect(ext).toBeDefined()
  })

  it('view can be created with the keymap extension', () => {
    const view = createView('hello world', [createKeymapExtension()])
    expect(view.state.doc.toString()).toBe('hello world')
  })

  it('Mod-b wraps selection with ** (bold)', () => {
    const view = createView('hello world', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 0, head: 5 } })
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('**hello** world')
  })

  it('Mod-i wraps selection with * (italic)', () => {
    const view = createView('hello world', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 0, head: 5 } })
    const event = new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('*hello* world')
  })

  it('Mod-Shift-s wraps selection with ~~ (strikethrough)', () => {
    const view = createView('hello world', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 0, head: 5 } })
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('~~hello~~ world')
  })

  it('Mod-` wraps selection with backticks (inline code)', () => {
    const view = createView('hello world', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 0, head: 5 } })
    const event = new KeyboardEvent('keydown', { key: '`', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('`hello` world')
  })

  it('Mod-k inserts link template', () => {
    const view = createView('click here', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 0, head: 10 } })
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('[click here](url)')
  })

  it('Mod-0 converts heading to paragraph', () => {
    const view = createView('# Heading', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 9 } })
    const event = new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('Heading')
  })

  it('Mod-1 converts paragraph to H1', () => {
    const view = createView('Some text', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 9 } })
    const event = new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('# Some text')
  })

  it('Mod-Enter toggles checkbox', () => {
    const view = createView('- [ ] task', [createKeymapExtension()])
    view.dispatch({ selection: { anchor: 9 } })
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })
    runScopeHandlers(view, event, 'editor')
    expect(view.state.doc.toString()).toBe('- [x] task')
  })
})
