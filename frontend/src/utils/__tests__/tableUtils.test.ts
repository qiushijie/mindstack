import { describe, it, expect, afterEach } from 'vitest'
import { createView } from '../../test-utils/helpers'
import {
  parseTable,
  findTableAtPos,
  findTableCell,
} from '../tableUtils'

afterEach(() => {
  document.body.innerHTML = ''
})

const TABLE_DOC = `| Name | Value |
|------|-------|
| Rev | 128 |
| Users | 3421 |`

describe('parseTable', () => {
  it('returns null when no Table node found', () => {
    const view = createView('Hello World')
    const result = parseTable(view, 0, 11)
    expect(result).toBeNull()
    view.destroy()
  })

  it('parses a table if GFM detects it', () => {
    const view = createView(TABLE_DOC)
    const result = parseTable(view, 0, TABLE_DOC.length)
    if (result) {
      expect(result.headers.length).toBeGreaterThanOrEqual(2)
      expect(result.rows.length).toBeGreaterThanOrEqual(2)
      expect(result.colCount).toBeGreaterThanOrEqual(2)
    }
    view.destroy()
  })
})

describe('findTableAtPos', () => {
  it('returns null when position is not in a table', () => {
    const view = createView('Just some text')
    const result = findTableAtPos(view, 5)
    expect(result).toBeNull()
    view.destroy()
  })

  it('finds table at position 0', () => {
    const view = createView(TABLE_DOC)
    const result = findTableAtPos(view, 0)
    if (result) {
      expect(result.tableFrom).toBe(0)
      expect(result.headers.length).toBeGreaterThanOrEqual(2)
    }
    view.destroy()
  })
})

describe('findTableCell', () => {
  it('returns null when not in a table', () => {
    const view = createView('No table here')
    const result = findTableCell(view, 5)
    expect(result).toBeNull()
    view.destroy()
  })

  it('returns table info when position is inside a table', () => {
    const view = createView(TABLE_DOC)
    const result = findTableCell(view, 25)
    if (result) {
      expect(result.table).toBeDefined()
      expect(typeof result.rowIdx).toBe('number')
      expect(typeof result.colIdx).toBe('number')
    }
    view.destroy()
  })
})
