import { buildTableMarkdown } from '../../../utils/tableUtils'
import type { TableCommandPayload } from './TableCommandPayload'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

export const deleteColumnCommand: EditorCommand<TableCommandPayload> = {
  id: 'editor.table.deleteColumn',

  execute(ctx: CommandContext, payload: TableCommandPayload): CommandResult {
    const { adapter } = ctx
    const { tableData, colIdx } = payload
    const { headers, rows, tableFrom, tableTo, colCount } = tableData
    if (colCount <= 1) {
      return { success: false }
    }

    const targetIdx = colIdx ?? 0
    const newHeaders = headers.map(h => h.content)
    newHeaders.splice(targetIdx, 1)

    const newRows = rows.map(row => {
      const newRow = row.map(c => c.content)
      newRow.splice(targetIdx, 1)
      return newRow
    })

    const newMarkdown = buildTableMarkdown(newHeaders, newRows)
    adapter.replaceRange(
      { from: tableFrom, to: tableTo, insert: newMarkdown },
      { selection: { anchor: tableFrom } },
    )
    adapter.focus()
    return { success: true }
  },
}
