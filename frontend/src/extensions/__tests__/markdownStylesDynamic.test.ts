import { describe, it, expect, afterEach } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { markdownStyles } from '../markdownStyles'
import { createCommandRunner } from '../../editor/commands/createCommandRunner'
import { wrapInlineCommand } from '../../editor/commands/inline/WrapInlineCommand'
import { toggleBlockTypeCommand } from '../../editor/commands/block/ToggleBlockTypeCommand'
import { createView, getVisibleText } from '../../test-utils/helpers'

const views: EditorView[] = []

afterEach(() => {
  views.forEach(v => v.destroy())
  views.length = 0
  document.body.innerHTML = ''
})

function createTrackedView(doc: string, exts: Parameters<typeof createView>[1] = []) {
  const view = createView(doc, exts)
  views.push(view)
  return view
}

describe('markdownStyles - dynamic updates', () => {
  it('hides ** after wrapInline bold', () => {
    const view = createTrackedView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    createCommandRunner(view).run(wrapInlineCommand, { before: '**', after: '**' })

    expect(view.state.doc.toString()).toBe('Hello **World**')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
    expect(visible).not.toContain('**')
  })

  it('hides * after wrapInline italic', () => {
    const view = createTrackedView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    createCommandRunner(view).run(wrapInlineCommand, { before: '*', after: '*' })

    expect(view.state.doc.toString()).toBe('Hello *World*')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
    expect(visible).not.toContain('*')
  })

  it('hides ~~ after wrapInline strikethrough', () => {
    const view = createTrackedView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    createCommandRunner(view).run(wrapInlineCommand, { before: '~~', after: '~~' })

    expect(view.state.doc.toString()).toBe('Hello ~~World~~')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
    expect(visible).not.toContain('~~')
  })

  it('hides # after toggleBlockType heading', () => {
    const view = createTrackedView('Hello World', [markdownStyles])
    view.dispatch({ selection: { anchor: 5 } })
    createCommandRunner(view).run(toggleBlockTypeCommand, { prefix: '# ' })

    expect(view.state.doc.toString()).toBe('# Hello World')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Hello World')
    expect(visible).not.toContain('#')
  })

  it('hides - after toggleBlockType list', () => {
    const view = createTrackedView('Item', [markdownStyles])
    view.dispatch({ selection: { anchor: 2 } })
    createCommandRunner(view).run(toggleBlockTypeCommand, { prefix: '- ' })

    expect(view.state.doc.toString()).toBe('- Item')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Item')
    expect(visible).not.toContain('-')
  })

  it('hides > after toggleBlockType quote', () => {
    const view = createTrackedView('Quote text', [markdownStyles])
    view.dispatch({ selection: { anchor: 5 } })
    createCommandRunner(view).run(toggleBlockTypeCommand, { prefix: '> ' })

    expect(view.state.doc.toString()).toBe('> Quote text')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toContain('Quote text')
    expect(visible).not.toContain('>')
  })

  it('unwraps bold and hides nothing', () => {
    const view = createTrackedView('Hello **World**', [markdownStyles])
    view.dispatch({ selection: { anchor: 8, head: 13 } })
    createCommandRunner(view).run(wrapInlineCommand, { before: '**', after: '**' })

    expect(view.state.doc.toString()).toBe('Hello World')

    const visible = getVisibleText(view, markdownStyles)
    expect(visible).toBe('Hello World')
  })

  it('hides marks after multiple sequential operations', () => {
    const view = createTrackedView('Text', [markdownStyles])
    view.dispatch({ selection: { anchor: 2 } })

    createCommandRunner(view).run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(view.state.doc.toString()).toBe('# Text')

    let visible = getVisibleText(view, markdownStyles)
    expect(visible).not.toContain('#')

    view.dispatch({ selection: { anchor: 2 } })
    createCommandRunner(view).run(toggleBlockTypeCommand, { prefix: '- ' })
    expect(view.state.doc.toString()).toBe('- Text')

    visible = getVisibleText(view, markdownStyles)
    expect(visible).not.toContain('-')
  })
})
