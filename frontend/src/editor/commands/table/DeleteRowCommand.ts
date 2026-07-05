import { buildTableMarkdown } from '../../../utils/tableUtils'
import type { TableCommandPayload } from './TableCommandPayload'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

export const deleteRowCommand: EditorCommand<TableCommandPayload> = {
  id: 'editor.table.deleteRow',

  execute(ctx: CommandContext, payload: TableCommandPayload): CommandResult {
    const { adapter } = ctx
    const { tableData, rowIdx } = payload
    if (rowIdx < 0 || rowIdx >= tableData.rows.length) {
      return { success: false }
    }
    const { headers, rows, tableFrom, tableTo } = tableData
    const newRows = rows.filter((_, i) => i !== rowIdx).map(r => r.map(c => c.content))

    const newMarkdown = buildTableMarkdown(headers.map(h => h.content), newRows)
    adapter.replaceRange(
      { from: tableFrom, to: tableTo, insert: newMarkdown },
      { selection: { anchor: tableFrom } },
    )
    adapter.focus()
    return { success: true }
  },
}
