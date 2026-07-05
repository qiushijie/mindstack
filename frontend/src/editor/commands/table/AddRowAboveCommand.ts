import { buildTableMarkdown } from '../../../utils/tableUtils'
import type { TableCommandPayload } from './TableCommandPayload'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

export const addRowAboveCommand: EditorCommand<TableCommandPayload> = {
  id: 'editor.table.addRowAbove',

  execute(ctx: CommandContext, payload: TableCommandPayload): CommandResult {
    const { adapter } = ctx
    const { tableData, rowIdx } = payload
    const { headers, rows, tableFrom, tableTo, colCount } = tableData
    const emptyRow = Array(colCount).fill('') as string[]
    const newRows = rows.map(r => r.map(c => c.content))
    const insertIdx = rowIdx === -1 ? 0 : rowIdx
    newRows.splice(insertIdx, 0, emptyRow)

    const newMarkdown = buildTableMarkdown(headers.map(h => h.content), newRows)
    adapter.replaceRange(
      { from: tableFrom, to: tableTo, insert: newMarkdown },
      { selection: { anchor: tableFrom } },
    )
    adapter.focus()
    return { success: true }
  },
}
