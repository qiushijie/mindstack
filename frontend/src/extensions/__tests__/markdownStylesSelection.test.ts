import { describe, it, expect, afterEach } from 'vitest'
import { markdownStaticStyles, markdownSelectionStyles } from '../markdownStyles'
import { createView, getVisibleText } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('markdownStyles - static layer', () => {
  it('does not rebuild decorations on pure selection changes', () => {
    const view = createView('# Hello World', [markdownStaticStyles])
    const before = view.plugin(markdownStaticStyles)!.decorations

    view.dispatch({ selection: { anchor: 5 } })

    const after = view.plugin(markdownStaticStyles)!.decorations
    expect(after).toBe(before)
    view.destroy()
  })

  it('still hides marks after selection change', () => {
    const view = createView('# Hello World', [markdownStaticStyles])
    view.dispatch({ selection: { anchor: 5 } })

    const visible = getVisibleText(view, markdownStaticStyles)
    expect(visible).toContain('Hello World')
    expect(visible).not.toContain('#')
    view.destroy()
  })
})

describe('markdownStyles - selection layer', () => {
  it('rebuilds decorations on selection change when image is present', () => {
    const doc = '![alt](https://example.com/img.png)'
    const view = createView(doc, [markdownSelectionStyles])
    // Preview mode
    view.dispatch({ selection: { anchor: doc.length } })
    const before = view.plugin(markdownSelectionStyles)!.decorations

    // Editing mode
    view.dispatch({ selection: { anchor: 3 } })

    const after = view.plugin(markdownSelectionStyles)!.decorations
    expect(after).not.toBe(before)
    view.destroy()
  })

  it('shows image widget in preview mode and source in editing mode', () => {
    const doc = '![alt text](https://example.com/img.png)'
    const view = createView(doc, [markdownSelectionStyles])

    // Preview mode: cursor outside image
    view.dispatch({ selection: { anchor: doc.length } })
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull()
    // Source should be hidden by the replace decoration
    expect(view.dom.textContent).not.toContain('![')

    // Editing mode: cursor inside image
    view.dispatch({ selection: { anchor: 3 } })
    expect(view.dom.querySelector('.cm-image-container')).toBeNull()
    expect(view.dom.textContent).toContain('![')
    expect(view.dom.textContent).toContain('](https://')

    view.destroy()
  })

  it('shows mermaid edit header when editing and hides when previewing', () => {
    const doc = '```mermaid\ngraph TD\n  A --> B\n```'
    const view = createView(doc, [markdownSelectionStyles])

    // Preview mode
    view.dispatch({ selection: { anchor: doc.length } })
    expect(view.dom.querySelector('.cm-mermaid-edit-header')).toBeNull()

    // Editing mode
    view.dispatch({ selection: { anchor: 15 } })
    expect(view.dom.querySelector('.cm-mermaid-edit-header')).not.toBeNull()

    view.destroy()
  })
})
