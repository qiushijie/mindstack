import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface ApplySlashItemPayload {
  slashFrom: number
  prefix: string
  example: string
}

export const applySlashItemCommand: EditorCommand<ApplySlashItemPayload> = {
  id: 'editor.applySlashItem',

  execute(ctx: CommandContext, payload: ApplySlashItemPayload): CommandResult {
    const { adapter } = ctx
    const { slashFrom, prefix, example } = payload
    const line = adapter.getLineAt(slashFrom)
    const slashOffset = slashFrom - line.from
    const before = line.text.slice(0, slashOffset)
    const prefixLen = prefix.length
    const insertText = before + prefix + example
    const cursorPos = line.from + before.length + prefixLen

    adapter.replaceRange(
      { from: line.from, to: line.from + line.text.length, insert: insertText },
      { selection: { anchor: cursorPos, head: cursorPos } },
    )
    adapter.focus()
    return { success: true }
  },
}
