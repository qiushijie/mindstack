import { describe, it, expect, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createInputHandler, handleMarkdownShortcut, handleEnter, handleBackspace, handleTab, handleTripleClick } from '../inputHandler'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

function dispatchKey(view: EditorView, key: string, shift = false): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    shiftKey: shift,
    cancelable: true,
  })
  return view.contentDOM.dispatchEvent(event)
}

function getDocText(view: EditorView): string {
  return view.state.doc.toString()
}

// --- handleEnter ---

describe('handleEnter', () => {
  it('heading line Enter produces newline without prefix', () => {
    const doc = '# Title'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    // heading has content, so just inserts newline (no prefix continuation)
    expect(getDocText(view)).toBe('# Title\n')
  })

  it('empty heading line Enter clears prefix', () => {
    const doc = 'Text\n# '
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    // empty heading: contentText.trim() === '' -> clears prefix
    expect(getDocText(view)).toBe('Text\n')
  })

  it('list item Enter creates new list item with "- "', () => {
    const doc = '- Item 1'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('- Item 1\n- ')
  })

  it('ordered list Enter increments number', () => {
    const doc = '1. First item'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('1. First item\n2. ')
  })

  it('ordered list Enter with higher numbers', () => {
    const doc = '3. Third item'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('3. Third item\n4. ')
  })

  it('todo item Enter creates new todo item', () => {
    const doc = '- [ ] Todo text'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('- [ ] Todo text\n- [ ] ')
  })

  it('completed todo item Enter creates new unchecked todo item', () => {
    const doc = '- [x] Done text'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('- [x] Done text\n- [ ] ')
  })

  it('blockquote Enter creates new quote line', () => {
    const doc = '> Quote text'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('> Quote text\n> ')
  })

  it('empty list item Enter clears prefix', () => {
    const doc = '- '
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('')
  })

  it('empty todo item Enter clears prefix', () => {
    const doc = '- [ ] '
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('')
  })

  it('inside fenced code block Enter does plain newline', () => {
    const doc = '```\ncode line\n```'
    const view = createView(doc, [createInputHandler()])
    // position at end of "code line"
    const pos = doc.indexOf('\n```')
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    // handleEnter returns false for FencedCode, CM6 default handles it
    expect(getDocText(view)).toContain('code line\n')
  })

  it('normal paragraph Enter does plain newline', () => {
    const doc = 'Hello world'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('Hello world\n')
  })

  it('Shift+Enter does not trigger handleEnter', () => {
    const doc = '- Item 1'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    // Shift+Enter: our handler returns false (shiftKey check)
    // In jsdom, CM default Enter handler does not fire from dispatched events either
    // So doc stays the same
    dispatchKey(view, 'Enter', true)
    expect(getDocText(view)).toBe('- Item 1')
  })

  it('empty ordered list item Enter clears prefix', () => {
    const doc = '1. '
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    expect(getDocText(view)).toBe('')
  })

  it('empty blockquote Enter continues blockquote prefix', () => {
    const doc = '> '
    const view = createView(doc, [createInputHandler()])
    const pos = doc.length
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Enter')
    // Empty blockquote: CM markdown extension auto-continues blockquote
    // The parser treats "> " as a blockquote, Enter produces ">\n> "
    expect(getDocText(view)).toBe('>\n> ')
  })
})

// --- handleBackspace ---
// Note: handleBackspace returns false when pos === 0 (document start).
// Tests use preceding content so the block starts at pos > 0.

describe('handleBackspace', () => {
  it('heading line start backspace removes "# " prefix', () => {
    const doc = 'Text\n# Title'
    const view = createView(doc, [createInputHandler()])
    const headingStart = doc.indexOf('#')
    view.dispatch({ selection: { anchor: headingStart } })
    dispatchKey(view, 'Backspace')
    expect(getDocText(view)).toBe('Text\nTitle')
  })

  it('h2 line start backspace removes "## " prefix', () => {
    const doc = 'Text\n## Subtitle'
    const view = createView(doc, [createInputHandler()])
    const headingStart = doc.indexOf('#')
    view.dispatch({ selection: { anchor: headingStart } })
    dispatchKey(view, 'Backspace')
    expect(getDocText(view)).toBe('Text\nSubtitle')
  })

  it('blockquote line start backspace removes "> " prefix', () => {
    const doc = 'Text\n> Quote text'
    const view = createView(doc, [createInputHandler()])
    const quoteStart = doc.indexOf('>')
    view.dispatch({ selection: { anchor: quoteStart } })
    dispatchKey(view, 'Backspace')
    expect(getDocText(view)).toBe('Text\nQuote text')
  })

  it('list line start backspace removes "- " prefix', () => {
    const doc = 'Text\n- List item'
    const view = createView(doc, [createInputHandler()])
    const listStart = doc.indexOf('-')
    view.dispatch({ selection: { anchor: listStart } })
    dispatchKey(view, 'Backspace')
    expect(getDocText(view)).toBe('Text\nList item')
  })

  it('ordered list line start backspace removes "1. " prefix', () => {
    const doc = 'Text\n1. Ordered item'
    const view = createView(doc, [createInputHandler()])
    const listStart = doc.indexOf('1')
    view.dispatch({ selection: { anchor: listStart } })
    dispatchKey(view, 'Backspace')
    expect(getDocText(view)).toBe('Text\nOrdered item')
  })

  it('todo line start backspace removes "- " prefix (list match runs first)', () => {
    const doc = 'Text\n- [ ] Todo text'
    const view = createView(doc, [createInputHandler()])
    const todoStart = doc.indexOf('-')
    view.dispatch({ selection: { anchor: todoStart } })
    dispatchKey(view, 'Backspace')
    // handleBackspace matches list pattern first: /^(\s*)([-*+]|\d+\.)\s(.*)$/
    // This removes "- " leaving "[ ] Todo text"
    expect(getDocText(view)).toBe('Text\n[ ] Todo text')
  })

  it('checked todo line start backspace removes "- " prefix (list match runs first)', () => {
    const doc = 'Text\n- [x] Done'
    const view = createView(doc, [createInputHandler()])
    const todoStart = doc.indexOf('-')
    view.dispatch({ selection: { anchor: todoStart } })
    dispatchKey(view, 'Backspace')
    // handleBackspace matches list pattern first, removes "- " leaving "[x] Done"
    expect(getDocText(view)).toBe('Text\n[x] Done')
  })

  it('non-line-start backspace does not trigger special handling', () => {
    const doc = 'Text\n# Title'
    const view = createView(doc, [createInputHandler()])
    // cursor in the middle of the heading line (not at line.from)
    const headingStart = doc.indexOf('#')
    const pos = headingStart + 3 // after "# T"
    view.dispatch({ selection: { anchor: pos } })
    dispatchKey(view, 'Backspace')
    // handleBackspace returns false since pos !== line.from
    // In jsdom, CM default backspace does not fire from dispatched events
    // So doc stays the same
    expect(getDocText(view)).toBe('Text\n# Title')
  })

  it('backspace at document start does nothing', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    dispatchKey(view, 'Backspace')
    // pos === 0, handleBackspace returns false
    expect(getDocText(view)).toBe('Hello')
  })
})

// --- handleTab ---

describe('handleTab', () => {
  it('Tab inserts two spaces at line start', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    dispatchKey(view, 'Tab')
    // handleTab inserts at line.from, not at cursor pos
    expect(getDocText(view)).toBe('  Hello')
  })

  it('Tab inserts two spaces at line start when cursor is mid-line', () => {
    const doc = 'Hello world'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 5 } })
    dispatchKey(view, 'Tab')
    // handleTab inserts at line.from (0), not at cursor pos (5)
    expect(getDocText(view)).toBe('  Hello world')
    // cursor moves to pos + 2 = 7
    expect(view.state.selection.main.head).toBe(7)
  })

  it('Shift+Tab removes leading two spaces', () => {
    const doc = '  Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 2 } })
    dispatchKey(view, 'Tab', true)
    expect(getDocText(view)).toBe('Hello')
  })

  it('Shift+Tab with no leading spaces does nothing', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    dispatchKey(view, 'Tab', true)
    expect(getDocText(view)).toBe('Hello')
  })

  it('Shift+Tab with only one leading space does nothing', () => {
    const doc = ' Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 1 } })
    dispatchKey(view, 'Tab', true)
    expect(getDocText(view)).toBe(' Hello')
  })

  it('Tab updates cursor position correctly', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    dispatchKey(view, 'Tab')
    expect(view.state.selection.main.head).toBe(2)
  })

  it('Shift+Tab updates cursor position correctly', () => {
    const doc = '  Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 4 } })
    dispatchKey(view, 'Tab', true)
    // cursor was 4, line.from=0, after removing 2 spaces: max(0, 4-2) = 2
    expect(view.state.selection.main.head).toBe(2)
  })
})

// --- handleMarkdownShortcut ---

describe('handleMarkdownShortcut', () => {
  it('recognizes "# " heading shortcut', () => {
    const view = createView('#', [createInputHandler()])
    view.dispatch({
      changes: { from: 1, to: 1, insert: ' ' },
      selection: { anchor: 2 },
    })
    expect(getDocText(view)).toBe('# ')
  })

  it('recognizes "## " heading shortcut', () => {
    const view = createView('##', [createInputHandler()])
    view.dispatch({
      changes: { from: 2, to: 2, insert: ' ' },
      selection: { anchor: 3 },
    })
    expect(getDocText(view)).toBe('## ')
  })

  it('recognizes "### " heading shortcut', () => {
    const view = createView('###', [createInputHandler()])
    view.dispatch({
      changes: { from: 3, to: 3, insert: ' ' },
      selection: { anchor: 4 },
    })
    expect(getDocText(view)).toBe('### ')
  })

  it('recognizes "- " list shortcut', () => {
    const view = createView('-', [createInputHandler()])
    view.dispatch({
      changes: { from: 1, to: 1, insert: ' ' },
      selection: { anchor: 2 },
    })
    expect(getDocText(view)).toBe('- ')
  })

  it('recognizes "1. " ordered list shortcut', () => {
    const view = createView('1.', [createInputHandler()])
    view.dispatch({
      changes: { from: 2, to: 2, insert: ' ' },
      selection: { anchor: 3 },
    })
    expect(getDocText(view)).toBe('1. ')
  })

  it('recognizes "> " blockquote shortcut', () => {
    const view = createView('>', [createInputHandler()])
    view.dispatch({
      changes: { from: 1, to: 1, insert: ' ' },
      selection: { anchor: 2 },
    })
    expect(getDocText(view)).toBe('> ')
  })

  it('recognizes "[] " todo shortcut', () => {
    const view = createView('[]', [createInputHandler()])
    view.dispatch({
      changes: { from: 2, to: 2, insert: ' ' },
      selection: { anchor: 3 },
    })
    expect(getDocText(view)).toBe('[] ')
  })

  it('recognizes "[x] " todo shortcut', () => {
    const view = createView('[x]', [createInputHandler()])
    view.dispatch({
      changes: { from: 3, to: 3, insert: ' ' },
      selection: { anchor: 4 },
    })
    expect(getDocText(view)).toBe('[x] ')
  })

  it('normal text input does not trigger shortcut', () => {
    const view = createView('Hello', [createInputHandler()])
    view.dispatch({
      changes: { from: 5, to: 5, insert: ' ' },
      selection: { anchor: 6 },
    })
    expect(getDocText(view)).toBe('Hello ')
  })
})

// --- Additional coverage tests ---
// Direct function call tests to ensure V8 coverage tracks internal branches

describe('handleMarkdownShortcut direct call', () => {
  it('returns true for "# " heading pattern', () => {
    const view = createView('# ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 2 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "## " heading pattern', () => {
    const view = createView('## ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 3 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "### " heading pattern', () => {
    const view = createView('### ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 4 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "#### " heading pattern', () => {
    const view = createView('#### ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 5 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "- " list pattern', () => {
    const view = createView('- ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 2 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "* " list pattern', () => {
    const view = createView('* ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 2 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "1. " ordered list pattern', () => {
    const view = createView('1. ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 3 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "> " blockquote pattern', () => {
    const view = createView('> ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 2 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "[] " todo pattern', () => {
    const view = createView('[] ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 3 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns true for "[x] " todo pattern', () => {
    const view = createView('[x] ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 4 } })
    expect(handleMarkdownShortcut(view)).toBe(true)
  })

  it('returns false for normal text', () => {
    const view = createView('Hello ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 6 } })
    expect(handleMarkdownShortcut(view)).toBe(false)
  })

  it('returns false for empty line', () => {
    const view = createView(' ', [createInputHandler()])
    view.dispatch({ selection: { anchor: 1 } })
    expect(handleMarkdownShortcut(view)).toBe(false)
  })
})

describe('handleEnter direct call', () => {
  it('heading line Enter produces newline without prefix', () => {
    const doc = '# Title'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('# Title\n')
  })

  it('empty heading clears prefix', () => {
    const doc = 'Text\n# '
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\n')
  })

  it('empty h4 heading clears prefix', () => {
    const doc = 'Text\n#### '
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\n')
  })

  it('blockquote Enter creates new quote line', () => {
    const doc = '> Quote text'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('> Quote text\n> ')
  })

  it('list item Enter creates new bullet item', () => {
    const doc = '- Item 1'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('- Item 1\n- ')
  })

  it('ordered list Enter increments number', () => {
    const doc = '1. First item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('1. First item\n2. ')
  })

  it('ordered list Enter with higher numbers', () => {
    const doc = '3. Third item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('3. Third item\n4. ')
  })

  it('todo item Enter creates new unchecked todo', () => {
    const doc = '- [ ] Todo text'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('- [ ] Todo text\n- [ ] ')
  })

  it('completed todo Enter creates new unchecked todo', () => {
    const doc = '- [x] Done text'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('- [x] Done text\n- [ ] ')
  })

  it('asterisk bullet list Enter preserves asterisk', () => {
    const doc = '* Item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('* Item\n* ')
  })

  it('plus bullet list Enter preserves plus', () => {
    const doc = '+ Item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('+ Item\n+ ')
  })

  it('indented ordered list Enter preserves indent', () => {
    const doc = '- Item\n  1. First'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    // The inner list item under BulletList gets bullet_list treatment, not ordered_list
    expect(getDocText(view)).toBe('- Item\n  1. First\n  - ')
  })

  it('indented bullet list Enter preserves indent', () => {
    const doc = '- Item\n  - Sub item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('- Item\n  - Sub item\n  - ')
  })

  it('empty list item clears prefix', () => {
    const doc = '- '
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('')
  })

  it('empty todo item continues with new item', () => {
    const doc = '- [ ] '
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    // contentText regex matches "- " not "- [ ] ", leaving "[ ] " which is not empty
    // So it inserts a new todo item instead of clearing
    expect(getDocText(view)).toBe('- [ ] \n- [ ] ')
  })

  it('empty ordered list item clears prefix', () => {
    const doc = '1. '
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('')
  })

  it('inside fenced code block returns false', () => {
    const doc = '```\ncode line\n```'
    const view = createView(doc, [createInputHandler()])
    const pos = doc.indexOf('\n```')
    view.dispatch({ selection: { anchor: pos } })
    const result = handleEnter(view)
    expect(result).toBe(false)
  })

  it('normal paragraph Enter inserts plain newline', () => {
    const doc = 'Hello world'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.length } })
    const result = handleEnter(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Hello world\n')
  })
})

describe('handleBackspace direct call', () => {
  it('removes "# " heading prefix at line start', () => {
    const doc = 'Text\n# Title'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('#') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nTitle')
  })

  it('removes "## " heading prefix at line start', () => {
    const doc = 'Text\n## Subtitle'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('#') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nSubtitle')
  })

  it('removes "> " blockquote prefix at line start', () => {
    const doc = 'Text\n> Quote text'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('>') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nQuote text')
  })

  it('removes ">" blockquote prefix without space', () => {
    const doc = 'Text\n>Quote'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('>') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nQuote')
  })

  it('removes "- " list prefix at line start', () => {
    const doc = 'Text\n- List item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('-') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nList item')
  })

  it('removes "* " list prefix at line start', () => {
    const doc = 'Text\n* Item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('*') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nItem')
  })

  it('removes "+ " list prefix at line start', () => {
    const doc = 'Text\n+ Item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('+') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nItem')
  })

  it('removes "1. " ordered list prefix at line start', () => {
    const doc = 'Text\n1. Ordered item'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('1') } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nOrdered item')
  })

  it('removes indented "- " list prefix', () => {
    const doc = 'Text\n  - Item'
    const view = createView(doc, [createInputHandler()])
    const listStart = doc.indexOf('-')
    view.dispatch({ selection: { anchor: listStart - 2 } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nItem')
  })

  it('removes indented "1. " ordered list prefix', () => {
    const doc = 'Text\n  1. Item'
    const view = createView(doc, [createInputHandler()])
    const listStart = doc.indexOf('1')
    view.dispatch({ selection: { anchor: listStart - 2 } })
    const result = handleBackspace(view)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Text\nItem')
  })

  it('returns false at document start', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    const result = handleBackspace(view)
    expect(result).toBe(false)
  })

  it('returns false when not at line start', () => {
    const doc = 'Text\n# Title'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('#') + 3 } })
    const result = handleBackspace(view)
    expect(result).toBe(false)
  })

  it('returns false for plain text at line start', () => {
    const doc = 'Text\nPlain'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: doc.indexOf('Plain') } })
    const result = handleBackspace(view)
    expect(result).toBe(false)
  })
})

describe('handleTab direct call', () => {
  it('Tab inserts two spaces at line start', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    const result = handleTab(view, false)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('  Hello')
  })

  it('Tab inserts at line start when cursor mid-line', () => {
    const doc = 'Hello world'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 5 } })
    const result = handleTab(view, false)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('  Hello world')
    expect(view.state.selection.main.head).toBe(7)
  })

  it('Shift+Tab removes leading two spaces', () => {
    const doc = '  Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 2 } })
    const result = handleTab(view, true)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Hello')
  })

  it('Shift+Tab with no leading spaces returns false', () => {
    const doc = 'Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 0 } })
    const result = handleTab(view, true)
    expect(result).toBe(false)
  })

  it('Shift+Tab with only one leading space returns false', () => {
    const doc = ' Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 1 } })
    const result = handleTab(view, true)
    expect(result).toBe(false)
  })

  it('Shift+Tab cursor position clamped to line.from', () => {
    const doc = '  Hello'
    const view = createView(doc, [createInputHandler()])
    view.dispatch({ selection: { anchor: 1 } })
    const result = handleTab(view, true)
    expect(result).toBe(true)
    expect(getDocText(view)).toBe('Hello')
    // cursor was 1, line.from was 0, after removing 2 spaces: max(0, 1-2) = 0
    expect(view.state.selection.main.head).toBe(0)
  })
})

// --- handleTripleClick ---

function mockPosAtCoords(view: EditorView, pos: number) {
  const original = view.posAtCoords.bind(view)
  view.posAtCoords = () => pos
  return original
}

describe('handleTripleClick', () => {
  it('returns false for single click (detail=1)', () => {
    const view = createView('Hello', [createInputHandler()])
    const event = new MouseEvent('mousedown', { detail: 1 })
    expect(handleTripleClick(view, event)).toBe(false)
  })

  it('returns false for double click (detail=2)', () => {
    const view = createView('Hello', [createInputHandler()])
    const event = new MouseEvent('mousedown', { detail: 2 })
    expect(handleTripleClick(view, event)).toBe(false)
  })

  it('returns false when posAtCoords returns null', () => {
    const view = createView('Hello', [createInputHandler()])
    const restore = mockPosAtCoords(view, null as any)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 0, clientY: 0 })
    expect(handleTripleClick(view, event)).toBe(false)
    view.posAtCoords = restore
  })

  it('does not throw for triple click outside editor', () => {
    const view = createView('Hello', [createInputHandler()])
    const event = new MouseEvent('mousedown', { detail: 3, clientX: -9999, clientY: -9999 })
    expect(() => handleTripleClick(view, event)).not.toThrow()
  })

  it('selects bullet list line without newline', () => {
    const doc = '- Item 1\n- Item 2'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 3)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(8) // line.to, before \n
  })

  it('selects paragraph line without newline', () => {
    const doc = 'Hello world\nNext line'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 5)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(11) // "Hello world".length
  })

  it('selects last line correctly', () => {
    const doc = 'First\nLast line'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 8)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(6) // "First\n".length
    expect(sel.to).toBe(15) // end of document, no trailing newline
  })

  it('selects heading line without newline', () => {
    const doc = '# Title\nParagraph'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 3)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(7) // "# Title".length
  })

  it('selects ordered list line without newline', () => {
    const doc = '1. First\n2. Second'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 5)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(8) // "1. First".length
  })

  it('selects empty line', () => {
    const doc = 'First\n\nLast'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 6) // empty line
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(6)
    expect(sel.to).toBe(6) // empty line: from == to
  })

  it('selects single-line document', () => {
    const doc = 'Only line'
    const view = createView(doc, [createInputHandler()])
    const restore = mockPosAtCoords(view, 4)
    const event = new MouseEvent('mousedown', { detail: 3, clientX: 10, clientY: 10 })
    expect(handleTripleClick(view, event)).toBe(true)
    view.posAtCoords = restore

    const sel = view.state.selection.main
    expect(sel.from).toBe(0)
    expect(sel.to).toBe(9) // "Only line".length
  })
})
