import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { Range, StateField, type Text } from '@codemirror/state'
import { createCommandRunner } from '../editor/commands/createCommandRunner'
import { editTableCellCommand } from '../editor/commands/table/EditTableCellCommand'
import { selectionIntersectsRange } from '../editor/widgets/widgetMode'
import { addWidgetMouseDownHandler } from '../editor/widgets/widgetEvents'
import { combineCleanup, trackListener } from '../editor/widgets/widgetCleanup'

const EMPTY_CELL_TEXT = ' '

// --- Table Widget ---

export class TableWidget extends WidgetType {
  constructor(
    readonly headers: string[],
    readonly rows: string[][],
    readonly cellPositions: { from: number; to: number }[][],
    readonly rowRanges: { from: number; to: number }[],
    readonly tableFrom: number,
  ) { super() }

  private cleanup: (() => void) | null = null

  toDOM() {
    const table = document.createElement('table')
    table.className = 'cm-table-widget'
    table.setAttribute('contenteditable', 'false')

    // Header
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    for (let c = 0; c < this.headers.length; c++) {
      const th = document.createElement('th')
      th.textContent = this.headers[c] || EMPTY_CELL_TEXT
      th.dataset.col = String(c)
      th.dataset.row = '-1'
      if (this.cellPositions[0]?.[c]) {
        th.dataset.from = String(this.cellPositions[0][c].from)
        th.dataset.to = String(this.cellPositions[0][c].to)
      }
      if (this.rowRanges[0]) {
        th.dataset.rowFrom = String(this.rowRanges[0].from)
        th.dataset.rowTo = String(this.rowRanges[0].to)
      }
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    // Body
    const tbody = document.createElement('tbody')
    for (let r = 0; r < this.rows.length; r++) {
      const tr = document.createElement('tr')
      for (let c = 0; c < this.rows[r].length; c++) {
        const td = document.createElement('td')
        td.textContent = this.rows[r][c] || EMPTY_CELL_TEXT
        td.dataset.row = String(r)
        td.dataset.col = String(c)
        if (this.cellPositions[r + 1]?.[c]) {
          td.dataset.from = String(this.cellPositions[r + 1][c].from)
          td.dataset.to = String(this.cellPositions[r + 1][c].to)
        }
        if (this.rowRanges[r + 1]) {
          td.dataset.rowFrom = String(this.rowRanges[r + 1].from)
          td.dataset.rowTo = String(this.rowRanges[r + 1].to)
        }
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)

    // Prevent CodeMirror from moving the text cursor into the table source
    // while the user interacts with the preview widget.
    this.cleanup = addWidgetMouseDownHandler(table, () => {})

    return table
  }

  eq(other: TableWidget) {
    if (other.headers.length !== this.headers.length) return false
    if (other.rows.length !== this.rows.length) return false
    if (other.tableFrom !== this.tableFrom) return false
    if (other.rowRanges.length !== this.rowRanges.length) return false
    for (let i = 0; i < this.headers.length; i++) {
      if (other.headers[i] !== this.headers[i]) return false
    }
    for (let r = 0; r < this.rows.length; r++) {
      if (other.rows[r].length !== this.rows[r].length) return false
      for (let c = 0; c < this.rows[r].length; c++) {
        if (other.rows[r][c] !== this.rows[r][c]) return false
      }
    }
    for (let r = 0; r < this.cellPositions.length; r++) {
      const otherRow = other.cellPositions[r]
      const thisRow = this.cellPositions[r]
      if (!otherRow || otherRow.length !== thisRow.length) return false
      for (let c = 0; c < thisRow.length; c++) {
        if (otherRow[c].from !== thisRow[c].from || otherRow[c].to !== thisRow[c].to) return false
      }
    }
    for (let r = 0; r < this.rowRanges.length; r++) {
      if (other.rowRanges[r].from !== this.rowRanges[r].from || other.rowRanges[r].to !== this.rowRanges[r].to) return false
    }
    return true
  }

  destroy() {
    this.cleanup?.()
    this.cleanup = null
  }

  ignoreEvent() { return false }
}

// --- Floating cell editor lifecycle ---

interface ActiveCellEdit {
  input: HTMLInputElement
  finish: (save: boolean) => void
  cellFrom: number
  cellTo: number
}

class CellEditController {
  private active: ActiveCellEdit | null = null

  start(view: EditorView, cell: HTMLElement, clickEvent?: MouseEvent) {
    const runner = createCommandRunner(view)

    // Commit any existing edit first
    if (this.active) this.active.finish(true)

    const from = Number(cell.dataset.from)
    const to = Number(cell.dataset.to)
    if (from === 0 && to === 0) return

    const rect = cell.getBoundingClientRect()
    const cs = getComputedStyle(cell)
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'cm-table-cell-input'
    input.value = (cell.textContent === EMPTY_CELL_TEXT ? '' : cell.textContent) ?? ''
    input.style.position = 'fixed'
    input.style.left = rect.left + 'px'
    input.style.top = rect.top + 'px'
    input.style.width = rect.width + 'px'
    input.style.height = rect.height + 'px'
    input.style.padding = cs.padding
    input.style.fontSize = cs.fontSize
    input.style.fontFamily = cs.fontFamily
    input.style.lineHeight = cs.lineHeight
    input.style.border = 'none'
    input.style.outline = 'none'
    input.style.boxShadow = 'none'
    input.style.backgroundColor = 'var(--surface-secondary)'
    input.style.boxSizing = 'border-box'
    input.style.margin = '0'

    input.dataset.from = String(from)
    input.dataset.to = String(to)
    input.dataset.cellRow = cell.dataset.row ?? ''
    input.dataset.cellCol = cell.dataset.col ?? ''
    input.dataset.rowFrom = cell.dataset.rowFrom ?? ''
    input.dataset.rowTo = cell.dataset.rowTo ?? ''
    input.dataset.totalCols = String(cell.closest('table')?.querySelectorAll('thead th').length ?? 0)

    document.body.appendChild(input)
    input.focus()
    if (clickEvent) {
      const inputRect = input.getBoundingClientRect()
      const text = input.value
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.font = cs.fontSize + ' ' + cs.fontFamily
      const clickX = clickEvent.clientX - inputRect.left - parseFloat(cs.paddingLeft)
      let pos = 0
      for (let i = 1; i <= text.length; i++) {
        if (ctx.measureText(text.slice(0, i)).width / 2 + ctx.measureText(text.slice(0, i - 1)).width / 2 >= clickX) break
        pos = i
      }
      input.setSelectionRange(pos, pos)
    }

    let finished = false
    const finish = (save: boolean) => {
      if (finished) return
      finished = true
      this.active = null
      cleanupHandles.forEach(h => h.dispose())

      if (save) {
        const newText = input.value
        const oldFrom = Number(input.dataset.from)
        const oldTo = Number(input.dataset.to)

        if (oldFrom === -1) {
          // Padded cell — rebuild the row
          const rowFrom = Number(input.dataset.rowFrom)
          const rowTo = Number(input.dataset.rowTo)
          const colIdx = Number(input.dataset.cellCol)
          const totalCols = Number(input.dataset.totalCols)
          runner.run(editTableCellCommand, {
            type: 'row',
            newText,
            rowFrom,
            rowTo,
            colIdx,
            totalCols,
          })
        } else {
          const oldText = view.state.doc.sliceString(oldFrom, oldTo).trim()
          if (newText !== oldText) {
            runner.run(editTableCellCommand, {
              type: 'cell',
              newText,
              cellFrom: oldFrom,
              cellTo: oldTo,
            })
          }
        }
      }
      input.remove()
    }

    const cleanupHandles = [
      trackListener(input, 'keydown', (e) => {
        const keyEvent = e as KeyboardEvent
        if (keyEvent.key === 'Enter') {
          keyEvent.preventDefault()
          finish(true)
          view.focus()
        } else if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault()
          finish(false)
          view.focus()
        } else if (keyEvent.key === 'Tab') {
          keyEvent.preventDefault()
          finish(true)
          // Move to next cell
          const row = Number(input.dataset.cellRow)
          const col = Number(input.dataset.cellCol)
          const table = cell.closest('table')
          if (table) {
            const next = findNextCell(table, row, col, keyEvent.shiftKey ? -1 : 1)
            if (next) this.start(view, next)
            else view.focus()
          }
        }
      }),
      trackListener(input, 'blur', () => finish(true)),
      trackListener(view.scrollDOM, 'scroll', () => finish(true)),
    ]

    this.active = { input, finish, cellFrom: from, cellTo: to }
  }

  update(update: ViewUpdate) {
    if (!this.active) return
    if (update.docChanged) {
      this.active.finish(true)
      return
    }
    if (update.selectionSet) {
      const sel = update.state.selection.main
      if (sel.from > this.active.cellTo || sel.to < this.active.cellFrom) {
        this.active.finish(true)
      }
    }
  }

  commit() {
    this.active?.finish(true)
  }

  destroy() {
    // Avoid data loss if the editor is destroyed while editing.
    this.active?.finish(true)
  }
}

export const tableCellEditPlugin = ViewPlugin.fromClass(CellEditController, {})

/* istanbul ignore next - DOM interaction */
function findNextCell(table: HTMLTableElement, row: number, col: number, direction: 1 | -1): HTMLElement | null {
  const ths = table.querySelectorAll('thead th')
  const trs = table.querySelectorAll('tbody tr')

  const cells: HTMLElement[] = []
  ths.forEach(th => cells.push(th as HTMLElement))
  trs.forEach(tr => {
    Array.from(tr.children).forEach(td => cells.push(td as HTMLElement))
  })

  const currentIdx = row === -1 ? col : ths.length + row * (ths.length || 1) + col
  const nextIdx = currentIdx + direction
  if (nextIdx < 0 || nextIdx >= cells.length) return null
  return cells[nextIdx]
}

// --- DOM event handlers ---

/* istanbul ignore next - DOM event handler */
export const tableEditHandler = EditorView.domEventHandlers({
  click(e, view) {
    const target = e.target as HTMLElement
    const cell = target.closest('td, th') as HTMLElement | null
    if (!cell) return false
    if (cell.dataset.from == null) return false

    e.preventDefault()
    const controller = view.plugin(tableCellEditPlugin)
    if (controller) controller.start(view, cell, e)
    return true
  },
})

// --- Plugin (StateField for block decoration support) ---

interface ParsedTable {
  from: number
  to: number
  headers: string[]
  rows: string[][]
  cellPositions: { from: number; to: number }[][]
  rowRanges: { from: number; to: number }[]
}

interface TablePluginState {
  tables: ParsedTable[]
  decorations: DecorationSet
}

function parseTables(
  doc: Text,
  tree: ReturnType<typeof syntaxTree>,
): ParsedTable[] {
  const tables: ParsedTable[] = []

  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') return

      const headers: string[] = []
      const rows: string[][] = []
      const cellPositions: { from: number; to: number }[][] = []
      const rowRanges: { from: number; to: number }[] = []

      let child = node.node.firstChild
      while (child) {
        if (child.name === 'TableHeader' || child.name === 'TableRow') {
          // Collect cells with their true column index derived from | delimiters
          const parsedCells: { colIdx: number; text: string; from: number; to: number }[] = []
          let cellChild = child.firstChild
          while (cellChild) {
            if (cellChild.name === 'TableCell') {
              const prefix = doc.sliceString(child.from, cellChild.from)
              const colIdx = (prefix.match(/\|/g) || []).length - 1
              parsedCells.push({
                colIdx,
                text: doc.sliceString(cellChild.from, cellChild.to).trim(),
                from: cellChild.from,
                to: cellChild.to,
              })
            }
            cellChild = cellChild.nextSibling
          }

          rowRanges.push({ from: child.from, to: child.to })

          if (child.name === 'TableHeader') {
            for (const c of parsedCells) headers.push(c.text)
            // Headers determine the column count; build positions aligned to indices
            const headerPositions: { from: number; to: number }[] =
              Array.from({ length: headers.length }, () => ({ from: -1, to: -1 }))
            for (const c of parsedCells) headerPositions[c.colIdx] = { from: c.from, to: c.to }
            cellPositions.push(headerPositions)
          } else {
            // Determine colCount from headers parsed so far
            const colCount = headers.length
            const cells: string[] = Array.from({ length: colCount }, () => '')
            const positions: { from: number; to: number }[] =
              Array.from({ length: colCount }, () => ({ from: -1, to: -1 }))
            for (const c of parsedCells) {
              if (c.colIdx >= 0 && c.colIdx < colCount) {
                cells[c.colIdx] = c.text
                positions[c.colIdx] = { from: c.from, to: c.to }
              }
            }
            rows.push(cells)
            cellPositions.push(positions)
          }
        }
        child = child.nextSibling
      }

      if (headers.length === 0) return

      tables.push({
        from: node.from,
        to: node.to,
        headers,
        rows,
        cellPositions,
        rowRanges,
      })
    },
  })

  return tables
}

function buildTableDecorations(
  tables: ParsedTable[],
  selection?: { from: number; to: number },
): DecorationSet {
  const ranges: Range<Decoration>[] = []

  for (const table of tables) {
    if (selection && selectionIntersectsRange(selection, table)) continue

    const widget = Decoration.replace({
      widget: new TableWidget(
        table.headers,
        table.rows,
        table.cellPositions,
        table.rowRanges,
        table.from,
      ),
      block: true,
    })
    ranges.push(widget.range(table.from, table.to))
  }

  return Decoration.set(ranges, true)
}

function tableSelectionOverlapChanged(
  tables: ParsedTable[],
  oldSel: { from: number; to: number },
  newSel: { from: number; to: number },
): boolean {
  for (const table of tables) {
    const oldOverlaps = selectionIntersectsRange(oldSel, table)
    const newOverlaps = selectionIntersectsRange(newSel, table)
    if (oldOverlaps !== newOverlaps) return true
  }
  return false
}

function buildTablePluginState(
  doc: Text,
  tree: ReturnType<typeof syntaxTree>,
  selection?: { from: number; to: number },
): TablePluginState {
  const tables = parseTables(doc, tree)
  return {
    tables,
    decorations: buildTableDecorations(tables, selection),
  }
}

export const tablePlugin = StateField.define<TablePluginState>({
  create(state) {
    return buildTablePluginState(state.doc, syntaxTree(state), state.selection.main)
  },
  update(state, tr) {
    if (tr.docChanged) {
      return buildTablePluginState(tr.state.doc, syntaxTree(tr.state), tr.state.selection.main)
    }
    if (tr.selection) {
      if (!tableSelectionOverlapChanged(
        state.tables,
        tr.startState.selection.main,
        tr.state.selection.main,
      )) {
        return state
      }
      return {
        tables: state.tables,
        decorations: buildTableDecorations(state.tables, tr.state.selection.main),
      }
    }
    return {
      tables: state.tables,
      decorations: state.decorations.map(tr.changes),
    }
  },
  provide: f => EditorView.decorations.from(f, v => v.decorations),
})

// --- Context menu position helper ---

/* istanbul ignore next - DOM interaction */
export function getTableCellFromEvent(view: EditorView, e: MouseEvent): {
  tableFrom: number
  tableTo: number
  rowIdx: number
  colIdx: number
} | null {
  const target = e.target as HTMLElement
  const cell = target.closest('td, th') as HTMLElement | null
  if (!cell) return null

  const from = cell.dataset.from
  const to = cell.dataset.to
  if (from == null || to == null) return null

  const rowIdx = Number(cell.dataset.row)
  const colIdx = Number(cell.dataset.col)

  const table = cell.closest('table')
  if (!table) return null

  let tableFrom = Infinity
  let tableTo = -1
  table.querySelectorAll('td, th').forEach(c => {
    const f = Number((c as HTMLElement).dataset.from || 0)
    const t = Number((c as HTMLElement).dataset.to || 0)
    if (f > 0 && f < tableFrom) tableFrom = f
    if (t > tableTo) tableTo = t
  })

  if (tableFrom === Infinity) return null

  return { tableFrom, tableTo, rowIdx, colIdx }
}
