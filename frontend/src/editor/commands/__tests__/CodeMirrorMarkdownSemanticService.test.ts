import { describe, it, expect, afterEach } from 'vitest'
import { createView } from '../../../test-utils/helpers'
import { CodeMirrorMarkdownSemanticService } from '../CodeMirrorMarkdownSemanticService'
import type { EditorView } from '@codemirror/view'

const views: EditorView[] = []

function createService(doc: string) {
  const view = createView(doc)
  views.push(view)
  return new CodeMirrorMarkdownSemanticService(view)
}

describe('CodeMirrorMarkdownSemanticService', () => {
  afterEach(() => {
    views.forEach(v => v.destroy())
    views.length = 0
    document.body.innerHTML = ''
  })

  it('returns paragraph for plain text line', () => {
    const service = createService('Hello world')
    const line = { from: 0, to: 11, text: 'Hello world' }
    expect(service.getBlockTypeAtLine(line)).toBe('Paragraph')
  })

  it('returns heading for heading line', () => {
    const service = createService('# Title')
    const line = { from: 0, to: 7, text: '# Title' }
    expect(service.getBlockTypeAtLine(line)).toBe('H1')
  })

  it('finds table at position inside table', () => {
    const service = createService('| A | B |\n| --- | --- |\n| a | b |')
    const table = service.findTableAtPos(10)
    expect(table).not.toBeNull()
    expect(table!.headers.length).toBe(2)
    expect(table!.rows.length).toBe(1)
  })

  it('returns null for table outside table', () => {
    const service = createService('Hello world')
    expect(service.findTableAtPos(5)).toBeNull()
  })

  it('finds table cell for header position', () => {
    const service = createService('| A | B |\n| --- | --- |\n| a | b |')
    const cell = service.findTableCell(3)
    expect(cell).not.toBeNull()
    expect(cell!.rowIdx).toBe(-1)
    expect(cell!.colIdx).toBe(0)
  })

  it('finds table cell for first body position', () => {
    const service = createService('| A | B |\n| --- | --- |\n| a | b |')
    const cell = service.findTableCell(26)
    expect(cell).not.toBeNull()
    expect(cell!.rowIdx).toBe(0)
    expect(cell!.colIdx).toBe(0)
  })

  it('finds table cell for second body position', () => {
    const service = createService('| A | B |\n| --- | --- |\n| a | b |')
    const cell = service.findTableCell(30)
    expect(cell).not.toBeNull()
    expect(cell!.rowIdx).toBe(0)
    expect(cell!.colIdx).toBe(1)
  })
})
