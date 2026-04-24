import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'

export interface TableCell {
  content: string
  from: number
  to: number
}

export interface TableData {
  headers: TableCell[]
  rows: TableCell[][]
  tableFrom: number
  tableTo: number
  colCount: number
}

export function parseTable(view: EditorView, tableFrom: number, tableTo: number): TableData | null {
  const doc = view.state.doc
  const tree = syntaxTree(view.state)

  let tableNode = tree.resolveInner(tableFrom, 1)
  let current: typeof tableNode | null = tableNode
  while (current && current.name !== 'Table') {
    current = current.parent
  }
  if (!current || current.name !== 'Table') return null

  const headers: TableCell[] = []
  const rows: TableCell[][] = []

  const tableStart = current.from
  const tableEnd = current.to

  // Collect parsed cells per row with their column indices
  let child = current.firstChild
  while (child) {
    if (child.name === 'TableHeader' || child.name === 'TableRow') {
      const parsedCells: { colIdx: number; cell: TableCell }[] = []
      let cellChild = child.firstChild
      while (cellChild) {
        if (cellChild.name === 'TableCell') {
          // Determine column index by counting | delimiters before this cell
          const prefix = doc.sliceString(child.from, cellChild.from)
          const colIdx = (prefix.match(/\|/g) || []).length - 1
          parsedCells.push({
            colIdx,
            cell: {
              content: doc.sliceString(cellChild.from, cellChild.to).trim(),
              from: cellChild.from,
              to: cellChild.to,
            },
          })
        }
        cellChild = cellChild.nextSibling
      }

      if (child.name === 'TableHeader') {
        for (const { cell } of parsedCells) {
          headers.push(cell)
        }
      } else {
        rows.push(parsedCells)
      }
    }
    child = child.nextSibling
  }

  if (headers.length === 0) return null

  // Normalize rows: fill in empty cells so row.length === headers.length
  const colCount = headers.length
  const normalizedRows: TableCell[][] = rows.map(parsedCells => {
    const row: TableCell[] = Array.from({ length: colCount }, () => ({ content: '', from: -1, to: -1 }))
    for (const { colIdx, cell } of parsedCells) {
      if (colIdx >= 0 && colIdx < colCount) {
        row[colIdx] = cell
      }
    }
    return row
  })

  return {
    headers,
    rows: normalizedRows,
    tableFrom: tableStart,
    tableTo: tableEnd,
    colCount,
  }
}

export function findTableAtPos(view: EditorView, pos: number): TableData | null {
  const tree = syntaxTree(view.state)
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, 1)
  while (node) {
    if (node.name === 'Table') {
      return parseTable(view, node.from, node.to)
    }
    node = node.parent
  }
  return null
}

export function findTableCell(
  view: EditorView,
  pos: number,
): { table: TableData; rowIdx: number; colIdx: number } | null {
  const table = findTableAtPos(view, pos)
  if (!table) return null

  // Check headers
  for (let c = 0; c < table.headers.length; c++) {
    const cell = table.headers[c]
    if (pos >= cell.from && pos <= cell.to) {
      return { table, rowIdx: -1, colIdx: c }
    }
  }

  // Check data rows
  for (let r = 0; r < table.rows.length; r++) {
    for (let c = 0; c < table.rows[r].length; c++) {
      const cell = table.rows[r][c]
      if (pos >= cell.from && pos <= cell.to) {
        return { table, rowIdx: r, colIdx: c }
      }
    }
  }

  return { table, rowIdx: -1, colIdx: -1 }
}

function buildTableMarkdown(headers: string[], rows: string[][]): string {
  const colCount = headers.length
  const lines: string[] = []

  const pad = (s: string) => s || '\u00A0'

  // Header row
  lines.push('| ' + headers.map(pad).join(' | ') + ' |')

  // Delimiter row
  const delimiters = headers.map(() => '------')
  lines.push('| ' + delimiters.join(' | ') + ' |')

  // Data rows
  for (const row of rows) {
    const padded = Array.from({ length: colCount }, (_, i) => pad(row[i] ?? ''))
    lines.push('| ' + padded.join(' | ') + ' |')
  }

  return lines.join('\n')
}

export function addRowBelow(view: EditorView, tableData: TableData, rowIdx: number): boolean {
  const { headers, rows, tableFrom, tableTo, colCount } = tableData
  const emptyRow = Array(colCount).fill('') as string[]
  const newRows = rows.map(r => r.map(c => c.content))
  const insertIdx = rowIdx === -1 ? 0 : rowIdx + 1
  newRows.splice(insertIdx, 0, emptyRow)

  const newMarkdown = buildTableMarkdown(headers.map(h => h.content), newRows)
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert: newMarkdown },
  })
  return true
}

export function addRowAbove(view: EditorView, tableData: TableData, rowIdx: number): boolean {
  const { headers, rows, tableFrom, tableTo, colCount } = tableData
  const emptyRow = Array(colCount).fill('') as string[]
  const newRows = rows.map(r => r.map(c => c.content))
  const insertIdx = rowIdx === -1 ? 0 : rowIdx
  newRows.splice(insertIdx, 0, emptyRow)

  const newMarkdown = buildTableMarkdown(headers.map(h => h.content), newRows)
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert: newMarkdown },
  })
  return true
}

export function deleteRow(view: EditorView, tableData: TableData, rowIdx: number): boolean {
  if (rowIdx < 0 || rowIdx >= tableData.rows.length) return false
  const { headers, rows, tableFrom, tableTo } = tableData
  const newRows = rows.filter((_, i) => i !== rowIdx).map(r => r.map(c => c.content))

  const newMarkdown = buildTableMarkdown(headers.map(h => h.content), newRows)
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert: newMarkdown },
  })
  return true
}

export function addColumnLeft(view: EditorView, tableData: TableData, _rowIdx: number, colIdx: number): boolean {
  const { headers, rows, tableFrom, tableTo } = tableData
  const newHeaders = headers.map(h => h.content)
  newHeaders.splice(colIdx, 0, '')

  const newRows = rows.map(row => {
    const newRow = row.map(c => c.content)
    newRow.splice(colIdx, 0, '')
    return newRow
  })

  const newMarkdown = buildTableMarkdown(newHeaders, newRows)
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert: newMarkdown },
  })
  return true
}

export function addColumnRight(view: EditorView, tableData: TableData, _rowIdx: number, colIdx: number): boolean {
  const { headers, rows, tableFrom, tableTo } = tableData
  const newHeaders = headers.map((h, _i) => h.content)
  newHeaders.splice(colIdx + 1, 0, '')

  const newRows = rows.map(row => {
    const newRow = row.map(c => c.content)
    newRow.splice(colIdx + 1, 0, '')
    return newRow
  })

  const newMarkdown = buildTableMarkdown(newHeaders, newRows)
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert: newMarkdown },
  })
  return true
}

export function deleteColumn(view: EditorView, tableData: TableData, _rowIdx: number, colIdx: number): boolean {
  const { headers, rows, tableFrom, tableTo, colCount } = tableData
  if (colCount <= 1) return false

  const newHeaders = headers.map(h => h.content)
  newHeaders.splice(colIdx, 1)

  const newRows = rows.map(row => {
    const newRow = row.map(c => c.content)
    newRow.splice(colIdx, 1)
    return newRow
  })

  const newMarkdown = buildTableMarkdown(newHeaders, newRows)
  view.dispatch({
    changes: { from: tableFrom, to: tableTo, insert: newMarkdown },
  })
  return true
}
