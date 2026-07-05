import type { CommandContext, CommandResult, EditorCommand } from '../types'

export type EditTableCellPayload =
  | { type: 'cell'; newText: string; cellFrom: number; cellTo: number }
  | { type: 'row'; newText: string; rowFrom: number; rowTo: number; colIdx: number; totalCols: number }

export const editTableCellCommand: EditorCommand<EditTableCellPayload> = {
  id: 'editor.table.editCell',

  execute(ctx: CommandContext, payload: EditTableCellPayload): CommandResult {
    const { adapter } = ctx

    if (payload.type === 'cell') {
      const { newText, cellFrom, cellTo } = payload
      const oldText = adapter.getContent().slice(cellFrom, cellTo).trim()
      if (newText !== oldText) {
        adapter.replaceRange({ from: cellFrom, to: cellTo, insert: newText })
      }
      adapter.focus()
      return { success: true }
    }

    const { newText, rowFrom, rowTo, colIdx, totalCols } = payload
    let rowText = adapter.getContent().slice(rowFrom, rowTo)
    const hasNewline = rowText.endsWith('\n')
    if (hasNewline) rowText = rowText.slice(0, -1)

    let cols = rowText.split('|')
    if (cols.length > 0 && cols[0].trim() === '') cols.shift()
    if (cols.length > 0 && cols[cols.length - 1].trim() === '') cols.pop()
    while (cols.length < totalCols) cols.push(' ')
    cols[colIdx] = ' ' + newText + ' '

    let newRowText = '|' + cols.join('|') + '|'
    if (hasNewline) newRowText += '\n'

    adapter.replaceRange({ from: rowFrom, to: rowTo, insert: newRowText })
    adapter.focus()
    return { success: true }
  },
}
