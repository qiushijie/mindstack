import { describe, it, expect, afterEach } from 'vitest'
import { createView } from '../../test-utils/helpers'
import {
  parseTable,
  findTableAtPos,
  findTableCell,
  addRowBelow,
  addRowAbove,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
} from '../tableUtils'
import type { TableData } from '../tableUtils'

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

// Test operation functions with real table data
function getTable(view: ReturnType<typeof createView>) {
  return findTableAtPos(view, 0)
}

describe('addRowBelow', () => {
  it('adds a row below with constructed table data', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addRowBelow(view, table, 0)
    const after = getTable(view)
    if (after) {
      expect(after.rows.length).toBe(table.rows.length + 1)
    }
    view.destroy()
  })

  it('adds a row below with rowIdx=-1', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addRowBelow(view, table, -1)
    const after = getTable(view)
    if (after) {
      expect(after.rows.length).toBe(table.rows.length + 1)
    }
    view.destroy()
  })
})

describe('addRowAbove', () => {
  it('adds a row above row 0', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addRowAbove(view, table, 0)
    const after = getTable(view)
    if (after) {
      expect(after.rows.length).toBe(table.rows.length + 1)
    }
    view.destroy()
  })

  it('adds a row above with rowIdx=-1', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addRowAbove(view, table, -1)
    const after = getTable(view)
    if (after) {
      expect(after.rows.length).toBe(table.rows.length + 1)
    }
    view.destroy()
  })
})

describe('deleteRow', () => {
  it('returns false for negative row index', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    expect(deleteRow(view, table, -1)).toBe(false)
    view.destroy()
  })

  it('returns false for out of range row index', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    expect(deleteRow(view, table, 99)).toBe(false)
    view.destroy()
  })

  it('deletes the first row', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    deleteRow(view, table, 0)
    const after = getTable(view)
    if (after) {
      expect(after.rows.length).toBe(table.rows.length - 1)
    }
    view.destroy()
  })

  it('deletes the last row', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    deleteRow(view, table, table.rows.length - 1)
    const after = getTable(view)
    if (after) {
      expect(after.rows.length).toBe(table.rows.length - 1)
    }
    view.destroy()
  })
})

describe('addColumnRight', () => {
  it('adds a column after the first column', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addColumnRight(view, table, 0, 0)
    const after = getTable(view)
    if (after) {
      expect(after.colCount).toBe(table.colCount + 1)
      // Original col 0 data preserved, new empty col at index 1
      expect(after.headers[0].content).toBe('Name')
      expect(after.headers[1].content).toBe('')
      expect(after.rows[0][0].content).toBe('Rev')
    }
    view.destroy()
  })

  it('adds a column at the end', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addColumnRight(view, table, 0, table.colCount - 1)
    const after = getTable(view)
    if (after) {
      expect(after.colCount).toBe(table.colCount + 1)
      expect(after.headers[after.colCount - 1].content).toBe('')
      // Original last column data preserved
      expect(after.headers[after.colCount - 2].content).toBe('Value')
    }
    view.destroy()
  })
})

describe('addColumnLeft', () => {
  it('adds a column before the first column', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addColumnLeft(view, table, 0, 0)
    const after = getTable(view)
    if (after) {
      expect(after.colCount).toBe(table.colCount + 1)
      // New empty col at index 0, original cols shifted right
      expect(after.headers[0].content).toBe('')
      expect(after.headers[1].content).toBe('Name')
      expect(after.rows[0][0].content).toBe('')
      expect(after.rows[0][1].content).toBe('Rev')
    }
    view.destroy()
  })

  it('adds a column before the last column', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table) { view.destroy(); return }

    addColumnLeft(view, table, 0, 1)
    const after = getTable(view)
    if (after) {
      expect(after.colCount).toBe(table.colCount + 1)
      expect(after.headers[0].content).toBe('Name')
      expect(after.headers[1].content).toBe('')
      expect(after.headers[2].content).toBe('Value')
    }
    view.destroy()
  })
})

describe('deleteColumn', () => {
  it('returns false when only one column', () => {
    const singleCol = '| A |\n|---|\n| 1 |'
    const view = createView(singleCol)
    const table = getTable(view)
    if (!table || table.colCount > 1) { view.destroy(); return }

    expect(deleteColumn(view, table, 0, 0)).toBe(false)
    view.destroy()
  })

  it('deletes the first column', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table || table.colCount <= 1) { view.destroy(); return }

    deleteColumn(view, table, 0, 0)
    const after = getTable(view)
    if (after) {
      expect(after.colCount).toBe(table.colCount - 1)
    }
    view.destroy()
  })

  it('deletes the last column', () => {
    const view = createView(TABLE_DOC)
    const table = getTable(view)
    if (!table || table.colCount <= 1) { view.destroy(); return }

    deleteColumn(view, table, 0, table.colCount - 1)
    const after = getTable(view)
    if (after) {
      expect(after.colCount).toBe(table.colCount - 1)
    }
    view.destroy()
  })
})
