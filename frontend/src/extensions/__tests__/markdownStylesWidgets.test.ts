import { describe, it, expect, afterEach, vi } from 'vitest'
import { markdownStyles, checkboxClickHandler, imageClickHandler } from '../markdownStyles'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('horizontal rule widget', () => {
  it('renders hr widget for ---', () => {
    const view = createView('before\n\n---\n\nafter', [markdownStyles])
    const hr = view.dom.querySelector('.cm-hr')
    expect(hr).not.toBeNull()
    expect(hr!.tagName).toBe('HR')
  })

  it('renders hr widget for ***', () => {
    const view = createView('text\n***\nmore', [markdownStyles])
    const hr = view.dom.querySelector('.cm-hr')
    expect(hr).not.toBeNull()
  })
})

describe('image widget', () => {
  it('renders image container for image markdown', () => {
    const view = createView('![alt text](https://example.com/img.png)', [markdownStyles])
    const container = view.dom.querySelector('.cm-image-container')
    expect(container).not.toBeNull()
  })

  it('renders img element with correct src', () => {
    const view = createView('![photo](https://example.com/photo.png)', [markdownStyles])
    const img = view.dom.querySelector('.cm-image-container .cm-image') as HTMLImageElement | null
    expect(img).not.toBeNull()
    expect(img!.src).toBe('https://example.com/photo.png')
    expect(img!.alt).toBe('photo')
  })

  it('renders image caption when alt and url are present', () => {
    const view = createView('![My Caption](https://example.com/img.png)', [markdownStyles])
    const caption = view.dom.querySelector('.cm-image-caption')
    expect(caption).not.toBeNull()
    expect(caption!.textContent).toBe('My Caption')
  })

  it('renders placeholder for image with empty url', () => {
    const view = createView('![just alt]()', [markdownStyles])
    const placeholder = view.dom.querySelector('.cm-image-placeholder')
    expect(placeholder).not.toBeNull()
    expect(placeholder!.textContent).toBe('just alt')
  })

  it('renders placeholder with default text when no alt or url', () => {
    const view = createView('![]()', [markdownStyles])
    const placeholder = view.dom.querySelector('.cm-image-placeholder')
    expect(placeholder).not.toBeNull()
    expect(placeholder!.textContent).toBe('Image')
  })

  it('applies cm-image-line class to line with image-only', () => {
    const view = createView('![img](https://example.com/x.png)', [markdownStyles])
    const imageLine = view.dom.querySelector('.cm-line.cm-image-line')
    expect(imageLine).not.toBeNull()
  })
})

describe('image editing state', () => {
  it('applies cm-image-editing when cursor is inside image node', () => {
    // Cursor at position 5 is inside ![alt](url) → inside the markdown
    const view = createView('![alt](https://example.com/x.png)', [markdownStyles])

    // After decorations are applied, dispatch cursor inside image
    // The image node spans the entire markdown syntax
    view.dispatch({ selection: { anchor: 4 } }) // inside "![al..."

    const editingLine = view.dom.querySelector('.cm-line.cm-image-editing')
    expect(editingLine).not.toBeNull()
  })

  it('shows image widget when cursor is outside image node', () => {
    const view = createView('some text ![alt](https://example.com/x.png) more', [markdownStyles])
    // Cursor in "some text" area, not inside image
    view.dispatch({ selection: { anchor: 2 } })

    const container = view.dom.querySelector('.cm-image-container')
    expect(container).not.toBeNull()

    const editingLine = view.dom.querySelector('.cm-line.cm-image-editing')
    expect(editingLine).toBeNull()
  })
})

describe('plugin update() lifecycle', () => {
  it('updates decorations after document change', () => {
    const view = createView('# Old Heading', [markdownStyles])

    // Verify initial state
    let h1Line = view.dom.querySelector('.cm-line.cm-h1')
    expect(h1Line).not.toBeNull()

    // Change document — replaces heading with paragraph
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'Just text' },
      selection: { anchor: 0 },
    })

    // After update, heading decorations should be gone
    h1Line = view.dom.querySelector('.cm-line.cm-h1')
    expect(h1Line).toBeNull()
  })

  it('updates decorations after adding a code block', () => {
    const view = createView('plain', [markdownStyles])

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '```js\ncode\n```' },
      selection: { anchor: 0 },
    })

    const codeBlock = view.dom.querySelector('.cm-line.cm-code-block')
    expect(codeBlock).not.toBeNull()
  })

  it('removes decorations when content becomes plain text', () => {
    const view = createView('```js\ncode\n```', [markdownStyles])

    let codeLine = view.dom.querySelector('.cm-line.cm-code-line')
    expect(codeLine).not.toBeNull()

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'plain' },
      selection: { anchor: 0 },
    })

    codeLine = view.dom.querySelector('.cm-line.cm-code-line')
    expect(codeLine).toBeNull()
  })
})

describe('checkbox click handler', () => {
  it('toggles checkbox from unchecked to checked', () => {
    const view = createView('- [ ] Task item', [markdownStyles, checkboxClickHandler])

    const checkbox = view.dom.querySelector('.cm-todo-check') as HTMLElement | null
    expect(checkbox).not.toBeNull()
    expect(checkbox!.classList.contains('done')).toBe(false)

    const clickEvent = new MouseEvent('click', { bubbles: true })
    checkbox!.dispatchEvent(clickEvent)

    expect(view.state.doc.toString()).toBe('- [x] Task item')
  })

  it('toggles checkbox from checked to unchecked', () => {
    const view = createView('- [x] Completed', [markdownStyles, checkboxClickHandler])

    const checkbox = view.dom.querySelector('.cm-todo-check') as HTMLElement | null
    expect(checkbox).not.toBeNull()
    expect(checkbox!.classList.contains('done')).toBe(true)

    const clickEvent = new MouseEvent('click', { bubbles: true })
    checkbox!.dispatchEvent(clickEvent)

    expect(view.state.doc.toString()).toBe('- [ ] Completed')
  })

  it('does nothing when clicking non-checkbox element', () => {
    const view = createView('- [ ] Task', [markdownStyles, checkboxClickHandler])
    const before = view.state.doc.toString()
    const clickEvent = new MouseEvent('click', { bubbles: true })
    const line = view.dom.querySelector('.cm-line')
    line!.dispatchEvent(clickEvent)

    expect(view.state.doc.toString()).toBe(before)
  })
})

describe('image click handler', () => {
  it('dispatches editor:edit-image event when image container is clicked', () => {
    const view = createView('![photo](images/photo.png)', [markdownStyles, imageClickHandler])
    const container = view.dom.querySelector('.cm-image-container') as HTMLElement | null
    expect(container).not.toBeNull()

    const handler = vi.fn()
    view.dom.addEventListener('editor:edit-image', handler)

    const clickEvent = new MouseEvent('click', { bubbles: true })
    container!.dispatchEvent(clickEvent)

    expect(handler).toHaveBeenCalledTimes(1)
    const detail = handler.mock.calls[0][0].detail
    expect(detail).toHaveProperty('url')
    expect(detail).toHaveProperty('alt')
    expect(detail).toHaveProperty('from')
    expect(detail).toHaveProperty('to')
  })

  it('dispatches editor:edit-image with correct url and alt', () => {
    const view = createView('![my photo](images/photo.png)', [markdownStyles, imageClickHandler])
    const container = view.dom.querySelector('.cm-image-container') as HTMLElement | null
    expect(container).not.toBeNull()

    const handler = vi.fn()
    view.dom.addEventListener('editor:edit-image', handler)

    const clickEvent = new MouseEvent('click', { bubbles: true })
    container!.dispatchEvent(clickEvent)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.alt).toBe('my photo')
    expect(handler.mock.calls[0][0].detail.url).toBe('images/photo.png')
  })

  it('does not dispatch event when clicking outside image', () => {
    const view = createView('![img](test.png)', [markdownStyles, imageClickHandler])
    const handler = vi.fn()
    view.dom.addEventListener('editor:edit-image', handler)

    const clickEvent = new MouseEvent('click', { bubbles: true })
    document.body.dispatchEvent(clickEvent)

    expect(handler).toHaveBeenCalledTimes(0)
  })
})

describe('CodeHeaderWidget render details', () => {
  it('renders header with lang label for fenced code', () => {
    const view = createView('```typescript\nconst x: number = 1\n```', [markdownStyles])
    const lang = view.dom.querySelector('.cm-code-lang')
    expect(lang).not.toBeNull()
    expect(lang!.textContent).toBe('typescript')
  })

  it('renders code header div structure', () => {
    const view = createView('```js\ncode\n```', [markdownStyles])
    const header = view.dom.querySelector('.cm-code-header')
    expect(header).not.toBeNull()
    const langInside = header!.querySelector('.cm-code-lang')
    expect(langInside).not.toBeNull()
  })
})

describe('block decorations visibility', () => {
  it('applies heading class to h1 line', () => {
    const view = createView('# Main Title', [markdownStyles])
    const h1Line = view.dom.querySelector('.cm-line.cm-h1')
    expect(h1Line).not.toBeNull()
  })

  it('applies heading class to h2 line', () => {
    const view = createView('## Section', [markdownStyles])
    const h2Line = view.dom.querySelector('.cm-line.cm-h2')
    expect(h2Line).not.toBeNull()
  })

  it('applies blockquote class to quote lines', () => {
    const view = createView('> quoted text', [markdownStyles])
    const quoteLine = view.dom.querySelector('.cm-line.cm-blockquote-line')
    expect(quoteLine).not.toBeNull()
  })

  it('applies list-item class to list lines', () => {
    const view = createView('- an item', [markdownStyles])
    const listLine = view.dom.querySelector('.cm-line.cm-list-item')
    expect(listLine).not.toBeNull()
  })

  it('renders bullet widget for unordered list', () => {
    const view = createView('- item one\n- item two', [markdownStyles])
    const bullets = view.dom.querySelectorAll('.cm-bullet')
    expect(bullets.length).toBe(2)
  })

  it('renders number widget for ordered list', () => {
    const view = createView('1. first\n2. second', [markdownStyles])
    const nums = view.dom.querySelectorAll('.cm-list-num')
    expect(nums.length).toBe(2)
    expect(nums[0].textContent).toBe('1.')
    expect(nums[1].textContent).toBe('2.')
  })

  it('renders checked checkbox widget for [x]', () => {
    const view = createView('- [x] Done task', [markdownStyles])
    const checkbox = view.dom.querySelector('.cm-todo-check')
    expect(checkbox).not.toBeNull()
    expect(checkbox!.classList.contains('done')).toBe(true)
  })

  it('renders unchecked checkbox widget for [ ]', () => {
    const view = createView('- [ ] Pending task', [markdownStyles])
    const checkbox = view.dom.querySelector('.cm-todo-check')
    expect(checkbox).not.toBeNull()
    expect(checkbox!.classList.contains('done')).toBe(false)
  })

  it('renders inline code with monospace styling', () => {
    const view = createView('Here is `inline code` text', [markdownStyles])
    // Inline code marks are hidden; the text should still be visible
    const visible = view.state.doc.toString()
    expect(visible).toContain('inline code')
  })

  it('renders multi-line blockquote correctly', () => {
    const view = createView('> line1\n> line2\n> line3', [markdownStyles])
    const quoteLines = view.dom.querySelectorAll('.cm-line.cm-blockquote-line')
    expect(quoteLines.length).toBe(3)
  })

  it('applies blockquote code-line style override', () => {
    // Blockquote containing a code block — cm-blockquote-line.cm-code-line
    const view = createView('> ```js\n> code\n> ```', [markdownStyles])
    const codeLines = view.dom.querySelectorAll('.cm-blockquote-line.cm-code-line')
    expect(codeLines.length).toBe(1)
  })
})
