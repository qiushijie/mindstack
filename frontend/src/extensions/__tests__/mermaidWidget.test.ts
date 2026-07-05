import { describe, it, expect, afterEach, vi } from 'vitest'
import { mermaidPlugin } from '../mermaidWidget'
import { markdownStyles } from '../markdownStyles'
import { createView } from '../../test-utils/helpers'

// Mock mermaid.render to avoid actual SVG generation in tests
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg class="mermaid-svg"><rect/></svg>' }),
  },
}))

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

// --- mermaidPlugin StateField ---

describe('mermaidPlugin', () => {
  // Doc with trailing text so cursor can be placed outside the block
  const mermaidDoc = '```mermaid\ngraph TD\n  A --> B\n```\n\nSome text after'

  it('creates preview decoration when cursor is outside mermaid block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor in the text after the block
    view.dispatch({ selection: { anchor: mermaidDoc.length - 4 } })

    const deco = view.state.field(mermaidPlugin).decorations
    let count = 0
    deco.between(0, view.state.doc.length, () => { count++ })
    expect(count).toBe(1)
    view.destroy()
  })

  it('skips preview decoration when cursor is inside mermaid block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor inside the block
    view.dispatch({ selection: { anchor: 15 } })

    const deco = view.state.field(mermaidPlugin).decorations
    let count = 0
    deco.between(0, view.state.doc.length, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('no decoration for non-mermaid code blocks', () => {
    const doc = '```js\nconst x = 1\n```'
    const view = createView(doc, [markdownStyles, mermaidPlugin])

    const deco = view.state.field(mermaidPlugin).decorations
    let count = 0
    deco.between(0, doc.length, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('no decoration for plain text', () => {
    const view = createView('Hello world', [markdownStyles, mermaidPlugin])

    const deco = view.state.field(mermaidPlugin).decorations
    let count = 0
    deco.between(0, 11, () => { count++ })
    expect(count).toBe(0)
    view.destroy()
  })

  it('updates decorations when document changes', () => {
    const view = createView('Hello', [markdownStyles, mermaidPlugin])
    let deco = view.state.field(mermaidPlugin).decorations
    let count1 = 0
    deco.between(0, 5, () => { count1++ })
    expect(count1).toBe(0)

    // Add mermaid block
    view.dispatch({ changes: { from: 5, to: 5, insert: '\n\n```mermaid\ngraph TD\n  A --> B\n```' } })
    deco = view.state.field(mermaidPlugin).decorations
    let count2 = 0
    deco.between(0, view.state.doc.length, () => { count2++ })
    expect(count2).toBe(1)
    view.destroy()
  })

  it('decoration spec has block=true', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor outside the block
    view.dispatch({ selection: { anchor: mermaidDoc.length - 4 } })

    const deco = view.state.field(mermaidPlugin).decorations
    let isBlock = false
    deco.between(0, view.state.doc.length, (_from, _to, dec) => {
      isBlock = dec.spec.block === true
    })
    expect(isBlock).toBe(true)
    view.destroy()
  })

  it('renders preview widget for empty mermaid block with cursor at boundary', () => {
    const doc = '```mermaid\n```'
    const view = createView(doc, [markdownStyles, mermaidPlugin])

    const deco = view.state.field(mermaidPlugin).decorations
    let count = 0
    deco.between(0, doc.length, () => { count++ })
    expect(count).toBe(1)
    view.destroy()
  })

  it('shows error message when mermaid.render fails', async () => {
    const mermaid = await import('mermaid')
    vi.spyOn(mermaid.default, 'render').mockRejectedValueOnce(new Error('parse error'))

    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    const outsidePos = mermaidDoc.indexOf('Some text after') + 4
    view.dispatch({ selection: { anchor: outsidePos } })

    // Wait for the async render to complete
    await new Promise(resolve => setTimeout(resolve, 10))

    const errorEl = view.dom.querySelector('.cm-mermaid-error')
    expect(errorEl).not.toBeNull()
    expect(errorEl!.textContent).toBe('parse error')

    view.destroy()
  })

  it('updates decorations on selection change without doc change', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor outside the block -> preview visible
    const outsidePos = mermaidDoc.indexOf('Some text after') + 4
    view.dispatch({ selection: { anchor: outsidePos } })

    const state1 = view.state.field(mermaidPlugin)
    const deco1 = state1.decorations
    let count1 = 0
    deco1.between(0, view.state.doc.length, () => { count1++ })
    expect(count1).toBe(1)

    // Move cursor inside the block -> preview should disappear
    view.dispatch({ selection: { anchor: 15 } })

    const state2 = view.state.field(mermaidPlugin)
    const deco2 = state2.decorations
    let count2 = 0
    deco2.between(0, view.state.doc.length, () => { count2++ })
    expect(count2).toBe(0)
    expect(deco2).not.toBe(deco1)
    expect(state2).not.toBe(state1)

    view.destroy()
  })

  it('keeps the same decoration set when selection stays outside the block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    const outsidePos = mermaidDoc.indexOf('Some text after') + 4
    view.dispatch({ selection: { anchor: outsidePos } })

    const state1 = view.state.field(mermaidPlugin)
    const deco1 = state1.decorations

    // Move cursor to another position still outside the block
    view.dispatch({ selection: { anchor: outsidePos + 2 } })

    const state2 = view.state.field(mermaidPlugin)
    const deco2 = state2.decorations
    expect(deco2).toBe(deco1)
    expect(state2).toBe(state1)

    view.destroy()
  })
})

// --- Mermaid edit mode in markdownStyles ---

describe('mermaid edit mode', () => {
  const mermaidDoc = '```mermaid\ngraph TD\n  A --> B\n```\n\nSome text after'

  it('shows mermaid edit header when cursor is inside block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor inside the block
    view.dispatch({ selection: { anchor: 15 } })

    const header = view.dom.querySelector('.cm-mermaid-edit-header')
    expect(header).not.toBeNull()
    view.destroy()
  })

  it('shows mermaid badge in edit header', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    view.dispatch({ selection: { anchor: 15 } })

    const badge = view.dom.querySelector('.cm-mermaid-badge')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('mermaid')
    view.destroy()
  })

  it('shows Preview button in edit header', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    view.dispatch({ selection: { anchor: 15 } })

    const btn = view.dom.querySelector('.cm-mermaid-preview-btn')
    expect(btn).not.toBeNull()
    expect(btn!.textContent).toContain('Preview')
    view.destroy()
  })

  it('applies mermaid block border styles in edit mode', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    view.dispatch({ selection: { anchor: 15 } })

    const lines = view.dom.querySelectorAll('.cm-line.cm-mermaid-block')
    expect(lines.length).toBeGreaterThan(0)
    view.destroy()
  })

  it('hides edit header when cursor is outside block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor in the text after the block
    view.dispatch({ selection: { anchor: mermaidDoc.length - 4 } })

    const header = view.dom.querySelector('.cm-mermaid-edit-header')
    expect(header).toBeNull()
    view.destroy()
  })

  it('shows preview widget when cursor is outside block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    view.dispatch({ selection: { anchor: mermaidDoc.length - 4 } })

    const preview = view.dom.querySelector('.cm-mermaid-preview')
    expect(preview).not.toBeNull()
    view.destroy()
  })

  it('shows Edit button in preview widget header', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    view.dispatch({ selection: { anchor: mermaidDoc.length - 4 } })

    const btn = view.dom.querySelector('.cm-mermaid-edit-btn')
    expect(btn).not.toBeNull()
    expect(btn!.textContent).toContain('Edit')
    view.destroy()
  })
})

// --- E2E: simulated DOM event sequences ---

describe('mermaid widget click interactions', () => {
  const mermaidDoc = '```mermaid\ngraph TD\n  A --> B\n```\n\nSome text after'

  it('clicking preview widget moves cursor into block and switches to edit mode', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor outside the block -> preview widget visible
    const outsidePos = mermaidDoc.indexOf('Some text after') + 4
    view.dispatch({ selection: { anchor: outsidePos } })

    const preview = view.dom.querySelector('.cm-mermaid-preview') as HTMLElement
    expect(preview).not.toBeNull()

    const beforeHead = view.state.selection.main.head

    // Simulate real user interaction: mousedown then click
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    preview.dispatchEvent(mousedown)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    preview.dispatchEvent(click)

    // Selection should have changed to inside the block
    expect(view.state.selection.main.head).not.toBe(beforeHead)
    // Cursor should now be inside the mermaid block
    const blockFrom = mermaidDoc.indexOf('```mermaid')
    const blockTo = mermaidDoc.indexOf('```\n\nSome') + 3
    expect(view.state.selection.main.head).toBeGreaterThanOrEqual(blockFrom)
    expect(view.state.selection.main.head).toBeLessThanOrEqual(blockTo)

    // Edit header should now be visible
    const editHeader = view.dom.querySelector('.cm-mermaid-edit-header')
    expect(editHeader).not.toBeNull()

    // Preview widget should be gone
    const previewAfter = view.dom.querySelector('.cm-mermaid-preview')
    expect(previewAfter).toBeNull()

    view.destroy()
  })

  it('clicking Edit button in preview widget moves cursor into block', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    const outsidePos = mermaidDoc.indexOf('Some text after') + 4
    view.dispatch({ selection: { anchor: outsidePos } })

    const editBtn = view.dom.querySelector('.cm-mermaid-edit-btn') as HTMLElement
    expect(editBtn).not.toBeNull()

    const beforeHead = view.state.selection.main.head

    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    editBtn.dispatchEvent(mousedown)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    editBtn.dispatchEvent(click)

    expect(view.state.selection.main.head).not.toBe(beforeHead)
    const editHeader = view.dom.querySelector('.cm-mermaid-edit-header')
    expect(editHeader).not.toBeNull()

    view.destroy()
  })

  it('clicking Preview button in edit header moves cursor out of block and switches to preview mode', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    // Cursor inside the block -> edit header visible
    view.dispatch({ selection: { anchor: 15 } })

    const previewBtn = view.dom.querySelector('.cm-mermaid-preview-btn') as HTMLElement
    expect(previewBtn).not.toBeNull()

    const beforeHead = view.state.selection.main.head
    const blockTo = mermaidDoc.indexOf('```\n\nSome') + 3

    // Simulate real user interaction
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    previewBtn.dispatchEvent(mousedown)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    previewBtn.dispatchEvent(click)

    // Selection should have changed to outside the block
    expect(view.state.selection.main.head).not.toBe(beforeHead)
    expect(view.state.selection.main.head).toBeGreaterThan(blockTo)

    // Preview widget should now be visible
    const preview = view.dom.querySelector('.cm-mermaid-preview')
    expect(preview).not.toBeNull()

    // Edit header should be gone
    const editHeaderAfter = view.dom.querySelector('.cm-mermaid-edit-header')
    expect(editHeaderAfter).toBeNull()

    view.destroy()
  })

  it('mousedown stopPropagation prevents CodeMirror from removing widget before click', () => {
    const view = createView(mermaidDoc, [markdownStyles, mermaidPlugin])
    const outsidePos = mermaidDoc.indexOf('Some text after') + 4
    view.dispatch({ selection: { anchor: outsidePos } })

    const preview = view.dom.querySelector('.cm-mermaid-preview') as HTMLElement
    expect(preview).not.toBeNull()

    // Only dispatch mousedown - widget should still be there
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    preview.dispatchEvent(mousedown)

    // After mousedown, widget should still exist (not removed by CodeMirror)
    const previewAfterMousedown = view.dom.querySelector('.cm-mermaid-preview')
    expect(previewAfterMousedown).not.toBeNull()
    // Selection should NOT have changed (we stopped propagation)
    expect(view.state.selection.main.head).toBe(outsidePos)

    view.destroy()
  })
})

