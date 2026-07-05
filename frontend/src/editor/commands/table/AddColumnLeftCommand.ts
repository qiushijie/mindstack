import { buildTableMarkdown } from '../../../utils/tableUtils'
import type { TableCommandPayload } from './TableCommandPayload'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

export const addColumnLeftCommand: EditorCommand<TableCommandPayload> = {
  id: 'editor.table.addColumnLeft',

  execute(ctx: CommandContext, payload: TableCommandPayload): CommandResult {
    const { adapter } = ctx
    const { tableData, colIdx } = payload
    const { headers, rows, tableFrom, tableTo } = tableData
    const newHeaders = headers.map(h => h.content)
    newHeaders.splice(colIdx ?? 0, 0, '')

    const newRows = rows.map(row => {
      const newRow = row.map(c => c.content)
      newRow.splice(colIdx ?? 0, 0, '')
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
