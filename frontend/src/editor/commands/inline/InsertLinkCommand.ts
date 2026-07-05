import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface InsertLinkPayload {
  defaultText?: string
}

export const insertLinkCommand: EditorCommand<InsertLinkPayload> = {
  id: 'editor.insertLink',

  execute(ctx: CommandContext, payload: InsertLinkPayload): CommandResult {
    const { adapter } = ctx
    const content = adapter.getContent()
    const sel = adapter.getSelection()
    const from = Math.min(sel.anchor, sel.head)
    const to = Math.max(sel.anchor, sel.head)
    const selected = content.slice(from, to)
    const text = selected || (payload.defaultText ?? 'link text')

    const insertText = `[${text}](url)`
    adapter.replaceRange(
      { from, to, insert: insertText },
      {
        selection: selected
          ? { anchor: from + text.length + 3, head: from + text.length + 6 }
          : { anchor: from + 1, head: from + 1 + text.length },
      },
    )
    adapter.focus()
    return { success: true }
  },
}
