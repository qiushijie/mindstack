import { describe, it, expect, afterEach } from 'vitest'
import type { Extension } from '@codemirror/state'
import { slashCommand, SLASH_ITEMS, createSlashCommand } from '../slashCommand'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

/** Simulate typing text at the current cursor, moving cursor to the end of inserted text */
function typeText(view: ReturnType<typeof createView>, text: string) {
  const pos = view.state.selection.main.head
  view.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: { anchor: pos + text.length },
  })
}

/** Dispatch a keyboard event on contentDOM where CM6 domEventHandlers are registered */
function dispatchKey(view: ReturnType<typeof createView>, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  return view.contentDOM.dispatchEvent(event)
}

/** Get the slash menu DOM element if it exists */
function getSlashMenu(): HTMLElement | null {
  return document.querySelector('.cm-slash-menu')
}

/** Get all slash menu item elements */
function getSlashItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.cm-slash-item'))
}

/** Create a view with a slash at the start, cursor positioned after it */
function createViewWithSlash(doc = '/', exts: Extension[] = [createSlashCommand()]) {
  const view = createView(doc, exts)
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  return view
}

// ---------------------------------------------------------------------------
// SLASH_ITEMS structure
// ---------------------------------------------------------------------------
describe('SLASH_ITEMS', () => {
  it('is derived from BLOCK_REGISTRY and has required fields', () => {
    expect(SLASH_ITEMS.length).toBeGreaterThan(0)
    for (const item of SLASH_ITEMS) {
      expect(item).toHaveProperty('label')
      expect(item).toHaveProperty('description')
      expect(item).toHaveProperty('prefix')
      expect(item).toHaveProperty('example')
      expect(typeof item.label).toBe('string')
      expect(typeof item.description).toBe('string')
      expect(typeof item.prefix).toBe('string')
      expect(typeof item.example).toBe('string')
    }
  })

  it('contains known block types', () => {
    const labels = SLASH_ITEMS.map(i => i.label)
    expect(labels).toContain('Heading 1')
    expect(labels).toContain('Heading 2')
    expect(labels).toContain('Heading 3')
    expect(labels).toContain('Heading 4')
    expect(labels).toContain('Bullet List')
    expect(labels).toContain('Numbered List')
    expect(labels).toContain('To-do')
    expect(labels).toContain('Blockquote')
    expect(labels).toContain('Code Block')
  })

  it('has unique labels', () => {
    const labels = SLASH_ITEMS.map(i => i.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

// ---------------------------------------------------------------------------
// createSlashCommand extension
// ---------------------------------------------------------------------------
describe('createSlashCommand', () => {
  it('returns an array of extensions', () => {
    const exts = createSlashCommand()
    expect(Array.isArray(exts) || typeof exts === 'object').toBe(true)
    expect(Array.isArray(exts) ? exts.length : 1).toBeGreaterThan(0)
  })

  it('view can be created with the extension', () => {
    const view = createView('', [createSlashCommand()])
    expect(view.state.doc.toString()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Slash menu appearance
// ---------------------------------------------------------------------------
describe('slash menu appearance', () => {
  it('shows menu when / is typed at line start', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    expect(getSlashMenu()).not.toBeNull()
    expect(getSlashItems().length).toBe(SLASH_ITEMS.length)
  })

  it('does not show menu when / is typed after non-whitespace', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, 'abc/')
    expect(getSlashMenu()).toBeNull()
  })

  it('shows menu when / is typed after leading whitespace', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '  /')
    expect(getSlashMenu()).not.toBeNull()
  })

  it('shows menu at line start on a multi-line document', () => {
    const view = createView('existing text\n', [createSlashCommand()])
    // Cursor is already at end of line 2 (empty line)
    typeText(view, '/')
    expect(getSlashMenu()).not.toBeNull()
  })

  it('hides menu when cursor moves away from slash', () => {
    const view = createViewWithSlash()
    expect(getSlashMenu()).not.toBeNull()
    // Move cursor to position 0 (before the slash)
    view.dispatch({ selection: { anchor: 0 } })
    expect(getSlashMenu()).toBeNull()
  })

  it('hides menu when slash is deleted', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    expect(getSlashMenu()).not.toBeNull()
    // Delete the slash character
    view.dispatch({ changes: { from: 0, to: 1 } })
    expect(getSlashMenu()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------
describe('filter matching', () => {
  it('shows all items when filter is empty', () => {
    const view = createViewWithSlash()
    expect(getSlashItems().length).toBe(SLASH_ITEMS.length)
  })

  it('filters by prefix match', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/Hea')
    const items = getSlashItems()
    const labels = items.map(el => el.querySelector('.cm-slash-label')!.textContent)
    expect(labels.some(l => l!.startsWith('Heading'))).toBe(true)
    for (const l of labels) {
      expect(l!.toLowerCase().startsWith('hea')).toBe(true)
    }
  })

  it('filters by abbreviation match (e.g. "cb" matches Code Block)', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/cb')
    const items = getSlashItems()
    const labels = items.map(el => el.querySelector('.cm-slash-label')!.textContent)
    expect(labels).toContain('Code Block')
  })

  it('filters by contains match', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/list')
    const items = getSlashItems()
    const labels = items.map(el => el.querySelector('.cm-slash-label')!.textContent)
    // "list" appears in labels for Bullet List and Numbered List
    expect(labels.some(l => l!.includes('List'))).toBe(true)
  })

  it('shows "No results" when filter matches nothing', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/zzzzz')
    expect(getSlashItems().length).toBe(0)
    expect(document.querySelector('.cm-slash-empty')).not.toBeNull()
    expect(document.querySelector('.cm-slash-empty')!.textContent).toBe('No results')
  })

  it('prefix match sorts before abbreviation match', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/b')
    const items = getSlashItems()
    const labels = items.map(el => el.querySelector('.cm-slash-label')!.textContent)
    // Items whose label starts with "b" should come first
    const firstLabel = labels[0]!.toLowerCase()
    expect(firstLabel.startsWith('b')).toBe(true)
  })

  it('is case-insensitive', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/heading')
    const items = getSlashItems()
    const labels = items.map(el => el.querySelector('.cm-slash-label')!.textContent)
    expect(labels.some(l => l === 'Heading 1')).toBe(true)
  })

  it('abbreviation "bl" matches Bullet List and Blockquote', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/bl')
    const items = getSlashItems()
    const labels = items.map(el => el.querySelector('.cm-slash-label')!.textContent)
    // "bl" matches initials of "Bullet List" and "Blockquote"
    expect(labels).toContain('Bullet List')
    expect(labels).toContain('Blockquote')
  })
})

// ---------------------------------------------------------------------------
// Navigation (ArrowUp / ArrowDown)
// ---------------------------------------------------------------------------
describe('navigation', () => {
  it('first item is active by default', () => {
    const view = createViewWithSlash()
    const items = getSlashItems()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].classList.contains('cm-slash-active')).toBe(true)
  })

  it('ArrowDown moves selection to next item', () => {
    const view = createViewWithSlash()
    dispatchKey(view, 'ArrowDown')
    const items = getSlashItems()
    expect(items[1].classList.contains('cm-slash-active')).toBe(true)
  })

  it('ArrowDown wraps around to first item', () => {
    const view = createViewWithSlash()
    // Press ArrowDown once for each item to cycle through all and wrap
    for (let i = 0; i < SLASH_ITEMS.length; i++) {
      dispatchKey(view, 'ArrowDown')
    }
    const items = getSlashItems()
    const activeIndex = items.findIndex(el => el.classList.contains('cm-slash-active'))
    expect(activeIndex).toBe(0)
  })

  it('ArrowUp moves selection to previous item', () => {
    const view = createViewWithSlash()
    // Move down first, then up
    dispatchKey(view, 'ArrowDown')
    dispatchKey(view, 'ArrowUp')
    const items = getSlashItems()
    expect(items[0].classList.contains('cm-slash-active')).toBe(true)
  })

  it('ArrowUp wraps around to last item', () => {
    const view = createViewWithSlash()
    dispatchKey(view, 'ArrowUp')
    const items = getSlashItems()
    const activeIndex = items.findIndex(el => el.classList.contains('cm-slash-active'))
    expect(activeIndex).toBe(items.length - 1)
  })

  it('ArrowUp/ArrowDown on empty filter results does not error', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/zzzz')
    expect(() => {
      dispatchKey(view, 'ArrowDown')
      dispatchKey(view, 'ArrowUp')
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Escape key
// ---------------------------------------------------------------------------
describe('Escape key', () => {
  it('Escape sets activeSlashFrom to -1 to dismiss menu', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    const plugin = view.plugin(slashCommand)!
    expect(plugin.activeSlashFrom).toBe(0)

    dispatchKey(view, 'Escape')
    // Escape handler sets activeSlashFrom to -1
    expect(plugin.activeSlashFrom).toBe(-1)
  })

  it('Escape without active menu leaves activeSlashFrom at -1', () => {
    const view = createView('hello', [createSlashCommand()])
    const plugin = view.plugin(slashCommand)!
    expect(plugin.activeSlashFrom).toBe(-1)
    dispatchKey(view, 'Escape')
    // activeSlashFrom remains -1, document unchanged
    expect(plugin.activeSlashFrom).toBe(-1)
    expect(view.state.doc.toString()).toBe('hello')
  })
})

// ---------------------------------------------------------------------------
// Enter key selection (applyItem)
// ---------------------------------------------------------------------------
describe('Enter key selection', () => {
  it('Enter selects first item and replaces slash line', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    dispatchKey(view, 'Enter')
    const doc = view.state.doc.toString()
    // First item is Heading 1: prefix "# " + example "Heading 1"
    expect(doc).toBe('# Heading 1')
  })

  it('Enter after ArrowDown selects second item', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    dispatchKey(view, 'ArrowDown')
    dispatchKey(view, 'Enter')
    const doc = view.state.doc.toString()
    // Second item is Heading 2: prefix "## " + example "Heading 2"
    expect(doc).toBe('## Heading 2')
  })

  it('Enter with filter replaces slash and filter text', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/Co')
    dispatchKey(view, 'Enter')
    const doc = view.state.doc.toString()
    expect(doc).toBe('```text\ncode here\n```')
  })

  it('Enter with abbreviation filter works', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/cb')
    dispatchKey(view, 'Enter')
    const doc = view.state.doc.toString()
    expect(doc).toBe('```text\ncode here\n```')
  })

  it('Enter after selecting bullet list applies correct prefix', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/Bullet')
    dispatchKey(view, 'Enter')
    const doc = view.state.doc.toString()
    expect(doc).toBe('- List item')
  })

  it('Enter after selecting todo applies correct prefix', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/To')
    dispatchKey(view, 'Enter')
    const doc = view.state.doc.toString()
    expect(doc).toBe('- [ ] To-do')
  })

  it('Enter on empty results does nothing to document', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/zzzzz')
    const docBefore = view.state.doc.toString()
    dispatchKey(view, 'Enter')
    expect(view.state.doc.toString()).toBe(docBefore)
  })

  it('cursor is placed after prefix with no selection', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    dispatchKey(view, 'Enter')
    // Heading 1: "# Heading 1" — cursor after prefix, no selection
    const sel = view.state.selection.main
    expect(sel.anchor).toBe('# '.length)
    expect(sel.head).toBe('# '.length)
    expect(sel.empty).toBe(true)
  })

  it('menu is dismissed after Enter selection', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    dispatchKey(view, 'Enter')
    expect(getSlashMenu()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Slash trigger edge cases
// ---------------------------------------------------------------------------
describe('slash trigger edge cases', () => {
  it('slash at position 0 triggers menu', () => {
    const view = createViewWithSlash()
    expect(getSlashMenu()).not.toBeNull()
  })

  it('slash in the middle of a word does not trigger menu', () => {
    const view = createView('hello/world', [createSlashCommand()])
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    expect(getSlashMenu()).toBeNull()
  })

  it('slash after leading spaces triggers menu', () => {
    const view = createView('   /', [createSlashCommand()])
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    expect(getSlashMenu()).not.toBeNull()
  })

  it('slash after a word and space does not trigger menu', () => {
    const view = createView('hello /', [createSlashCommand()])
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    expect(getSlashMenu()).toBeNull()
  })

  it('typing after slash updates the filter in real-time', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    expect(getSlashItems().length).toBe(SLASH_ITEMS.length)

    typeText(view, 'H')
    const filteredH = getSlashItems().length
    expect(filteredH).toBeLessThan(SLASH_ITEMS.length)
    expect(filteredH).toBeGreaterThan(0)

    typeText(view, 'e')
    const filteredHe = getSlashItems().length
    expect(filteredHe).toBeLessThanOrEqual(filteredH)
  })
})

// ---------------------------------------------------------------------------
// Plugin state management
// ---------------------------------------------------------------------------
describe('plugin state', () => {
  it('plugin is accessible via view.plugin(slashCommand)', () => {
    const view = createView('', [createSlashCommand()])
    const plugin = view.plugin(slashCommand)
    expect(plugin).toBeDefined()
    expect(plugin!.activeSlashFrom).toBe(-1)
  })

  it('activeSlashFrom is set when slash is active', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    const plugin = view.plugin(slashCommand)
    expect(plugin!.activeSlashFrom).toBe(0)
  })

  it('activeSlashFrom resets to -1 when slash is removed', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    expect(view.plugin(slashCommand)!.activeSlashFrom).toBe(0)
    // Delete the slash
    view.dispatch({ changes: { from: 0, to: 1 } })
    expect(view.plugin(slashCommand)!.activeSlashFrom).toBe(-1)
  })

  it('selectedIndex resets to 0 when filter changes', () => {
    const view = createView('', [createSlashCommand()])
    typeText(view, '/')
    dispatchKey(view, 'ArrowDown')
    // selectedIndex should now be 1
    typeText(view, 'H')
    const plugin = view.plugin(slashCommand)!
    expect(plugin.selectedIndex).toBe(0)
  })
})
