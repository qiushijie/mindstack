import { describe, it, expect, afterEach } from 'vitest'
import { markdownStyles } from '../markdownStyles'
import { wrapInline, toggleBlockType } from '../../utils/markdownUtils'
import { createView, getVisibleText } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('markdownStyles - dynamic updates', () => {
  it('hides ** after wrapInline bold', () => {
    const view = createView('Hello World', [markdownStyles])
    // Select "World"
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    // Apply bold
    wrapInline('**', '**')(view)

    // Doc should now be "Hello **World**"
    expect(view.state.doc.toString()).toBe('Hello **World**')

    // Visible text should NOT contain **
    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
    expect(visible).not.toContain('**')
  })

  it('hides * after wrapInline italic', () => {
    const view = createView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    wrapInline('*', '*')(view)

    expect(view.state.doc.toString()).toBe('Hello *World*')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
    expect(visible).not.toContain('*')
  })

  it('hides ~~ after wrapInline strikethrough', () => {
    const view = createView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    wrapInline('~~', '~~')(view)

    expect(view.state.doc.toString()).toBe('Hello ~~World~~')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
    expect(visible).not.toContain('~~')
  })

  it('hides # after toggleBlockType heading', () => {
    const view = createView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('# ')(view)

    expect(view.state.doc.toString()).toBe('# Hello World')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Hello World')
    expect(visible).not.toContain('#')
  })

  it('hides - after toggleBlockType list', () => {
    const view = createView('Item', [markdownStyles])
    view.dispatch({ selection: { anchor: 2 } })
    toggleBlockType('- ')(view)

    expect(view.state.doc.toString()).toBe('- Item')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Item')
    expect(visible).not.toContain('-')
  })

  it('hides > after toggleBlockType quote', () => {
    const view = createView('Quote text', [markdownStyles])
    view.dispatch({ selection: { anchor: 5 } })
    toggleBlockType('> ')(view)

    expect(view.state.doc.toString()).toBe('> Quote text')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Quote text')
    expect(visible).not.toContain('>')
  })

  it('unwraps bold and hides nothing', () => {
    const view = createView('Hello **World**', [markdownStyles])
    // Select "World" (positions 8..13 in "Hello **World**")
    view.dispatch({ selection: { anchor: 8, head: 13 } })
    wrapInline('**', '**')(view)

    expect(view.state.doc.toString()).toBe('Hello World')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
  })

  it('hides marks after multiple sequential operations', () => {
    const view = createView('Text', [markdownStyles])
    view.dispatch({ selection: { anchor: 2 } })

    // Make it a heading
    toggleBlockType('# ')(view)
    expect(view.state.doc.toString()).toBe('# Text')

    let visible = getVisibleText(view, markdownStyles)
    expect(visible).not.toContain('#')

    // Make it a list
    view.dispatch({ selection: { anchor: 2 } })
    toggleBlockType('- ')(view)
    expect(view.state.doc.toString()).toBe('- Text')

    visible = getVisibleText(view, markdownStyles)
    expect(visible).not.toContain('-')
  })
})
