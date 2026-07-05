import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface InsertBlockPayload {
  lineFrom: number
  prefix: string
  example: string
}

export const insertBlockCommand: EditorCommand<InsertBlockPayload> = {
  id: 'editor.insertBlock',

  execute(ctx: CommandContext, payload: InsertBlockPayload): CommandResult {
    const { adapter } = ctx
    const { lineFrom, prefix, example } = payload
    const line = adapter.getLineAt(lineFrom)
    const insertPos = line.to
    const prefixPart = '\n\n' + prefix
    const insertText = prefixPart + example

    adapter.replaceRange(
      { from: insertPos, to: insertPos, insert: insertText },
      { selection: { anchor: prefixPart.length + insertPos, head: insertText.length + insertPos } },
    )
    adapter.focus()
    return { success: true }
  },
}
