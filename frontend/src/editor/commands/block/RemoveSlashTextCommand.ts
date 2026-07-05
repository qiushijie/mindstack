import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface RemoveSlashTextPayload {
  from: number
  to: number
}

export const removeSlashTextCommand: EditorCommand<RemoveSlashTextPayload> = {
  id: 'editor.removeSlashText',

  execute(ctx: CommandContext, payload: RemoveSlashTextPayload): CommandResult {
    const { adapter } = ctx
    const { from, to } = payload

    adapter.replaceRange(
      { from, to, insert: '' },
      { selection: { anchor: from } },
    )
    adapter.focus()
    return { success: true }
  },
}
