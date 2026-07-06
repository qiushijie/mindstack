import { describe, it, expect, afterEach } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { createView } from '../../../test-utils/helpers'
import { CodeMirrorAdapter } from '../../codemirror/CodeMirrorAdapter'
import { CommandRunner } from '../CommandRunner'
import { CodeMirrorMarkdownSemanticService } from '../CodeMirrorMarkdownSemanticService'
import { wrapInlineCommand } from '../inline/WrapInlineCommand'
import { insertLinkCommand } from '../inline/InsertLinkCommand'
import { toggleBlockTypeCommand } from '../block/ToggleBlockTypeCommand'
import { toggleCheckboxCommand } from '../block/ToggleCheckboxCommand'
import { insertBlockCommand } from '../block/InsertBlockCommand'
import { addRowBelowCommand } from '../table/AddRowBelowCommand'
import { insertImageCommand } from '../image/InsertImageCommand'
import { moveBlockCommand } from '../drag/MoveBlockCommand'
import type { TableData } from '../../../utils/tableUtils'

const views: EditorView[] = []

function createRunner(doc: string) {
  const view = createView(doc)
  views.push(view)
  const adapter = new CodeMirrorAdapter(view)
  const semantics = new CodeMirrorMarkdownSemanticService(view)
  const runner = new CommandRunner({ adapter, semantics })
  return { view, adapter, runner }
}

describe('CodeMirrorAdapter command integration', () => {
  afterEach(() => {
    views.forEach(v => v.destroy())
    views.length = 0
    document.body.innerHTML = ''
  })

  it('wrapInlineCommand boldens selection', () => {
    const { view, runner } = createRunner('Hello World')
    view.dispatch({ selection: { anchor: 6, head: 11 } })
    runner.run(wrapInlineCommand, { before: '**', after: '**' })
    expect(view.state.doc.toString()).toBe('Hello **World**')
  })

  it('toggleBlockTypeCommand converts paragraph to heading', () => {
    const { view, runner } = createRunner('Hello World')
    view.dispatch({ selection: { anchor: 5 } })
    runner.run(toggleBlockTypeCommand, { prefix: '# ' })
    expect(view.state.doc.toString()).toBe('# Hello World')
  })

  it('insertLinkCommand wraps selected text', () => {
    const { view, runner } = createRunner('Click here')
    view.dispatch({ selection: { anchor: 0, head: 10 } })
    runner.run(insertLinkCommand, {})
    expect(view.state.doc.toString()).toContain('[Click here]')
    expect(view.state.doc.toString()).toContain('(url)')
  })

  it('toggleCheckboxCommand toggles task marker', () => {
    const { view, runner } = createRunner('- [ ] Task')
    view.dispatch({ selection: { anchor: 5 } })
    runner.run(toggleCheckboxCommand)
    expect(view.state.doc.toString()).toBe('- [x] Task')
  })

  it('insertBlockCommand inserts a block at line', () => {
    const { view, runner } = createRunner('Line one\nLine two')
    runner.run(insertBlockCommand, { lineFrom: 1, prefix: '- ', example: 'New item' })
    expect(view.state.doc.toString()).toBe('Line one\n\n- New item\nLine two')
  })

  it('addRowBelowCommand adds a table row', () => {
    const { view, runner } = createRunner('| A | B |\n| --- | --- |\n| a | b |')
    const tableData: TableData = {
      headers: [{ content: 'A', from: 2, to: 3 }, { content: 'B', from: 6, to: 7 }],
      rows: [[{ content: 'a', from: 22, to: 23 }, { content: 'b', from: 26, to: 27 }]],
      tableFrom: 0,
      tableTo: view.state.doc.length,
      colCount: 2,
    }
    runner.run(addRowBelowCommand, { tableData, rowIdx: 0 })
    expect(view.state.doc.toString()).toContain('| a | b |')
    expect(view.state.selection.main.anchor).toBeGreaterThan(0)
    expect(view.state.doc.toString()).toContain('|   |   |')
  })

  it('insertImageCommand inserts image after the line', () => {
    const { view, runner } = createRunner('Hello ')
    view.dispatch({ selection: { anchor: 6 } })
    runner.run(insertImageCommand, { url: 'image.png', alt: 'pic' })
    expect(view.state.doc.toString()).toBe('Hello \n\n![pic](image.png)')
  })

  it('insertImageCommand replaces edited image range', () => {
    const { view, runner } = createRunner('Hello ![old](image.png)')
    runner.run(insertImageCommand, { url: 'new.png', alt: 'new', editingFrom: 6, editingTo: 23 })
    expect(view.state.doc.toString()).toBe('Hello ![new](new.png)')
  })

  it('moveBlockCommand moves a block', () => {
    const { view, runner } = createRunner('# A\n\n# B')
    runner.run(moveBlockCommand, { sourceLineFrom: 1, sourceLineTo: 1, targetLine: 3 })
    expect(view.state.doc.toString()).toBe('\n# A\n# B')
  })
})
