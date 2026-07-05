import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface InsertImagePayload {
  url: string
  alt: string
  lineFrom?: number
  editingFrom?: number
  editingTo?: number
}

export const insertImageCommand: EditorCommand<InsertImagePayload> = {
  id: 'editor.insertImage',

  execute(ctx: CommandContext, payload: InsertImagePayload): CommandResult {
    const { adapter } = ctx
    const { url, alt } = payload

    if (payload.editingFrom != null && payload.editingTo != null) {
      // Edit mode: replace existing image markdown
      const newText = `![${alt}](${url})`
      adapter.replaceRange(
        { from: payload.editingFrom, to: payload.editingTo, insert: newText },
        { selection: { anchor: payload.editingFrom + newText.length } },
      )
      adapter.focus()
      return { success: true }
    }

    // Insert mode: add new image after the line
    const lineFrom = payload.lineFrom ?? 0
    const line = adapter.getLineAt(lineFrom)
    const insertText = `\n\n![${alt}](${url})`
    adapter.replaceRange(
      { from: line.to, to: line.to, insert: insertText },
      { selection: { anchor: line.to + insertText.length } },
    )
    adapter.focus()
    return { success: true }
  },
}
