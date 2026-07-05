import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface WrapInlinePayload {
  before: string
  after: string
}

export const wrapInlineCommand: EditorCommand<WrapInlinePayload> = {
  id: 'editor.wrapInline',

  execute(ctx: CommandContext, payload: WrapInlinePayload): CommandResult {
    const { adapter } = ctx
    const { before, after } = payload
    const content = adapter.getContent()
    const sel = adapter.getSelection()

    let from = Math.min(sel.anchor, sel.head)
    let to = Math.max(sel.anchor, sel.head)

    // Trim newlines from selection so inline marks don't span lines
    while (from < to && content.slice(from, from + 1) === '\n') from++
    while (to > from && content.slice(to - 1, to) === '\n') to--
    const selected = content.slice(from, to)

    if (from === to) {
      adapter.replaceRange(
        { from, to, insert: before + after },
        { selection: { anchor: from + before.length } },
      )
      adapter.focus()
      return { success: true }
    }

    const beforeText = content.slice(Math.max(0, from - before.length), from)
    const afterText = content.slice(to, to + after.length)

    if (beforeText === before && afterText === after) {
      adapter.replaceRange(
        { from: from - before.length, to: to + after.length, insert: selected },
        { selection: { anchor: from - before.length, head: to - before.length } },
      )
      adapter.focus()
      return { success: true }
    }

    adapter.replaceRange(
      { from, to, insert: before + selected + after },
      { selection: { anchor: from + before.length, head: to + before.length } },
    )
    adapter.focus()
    return { success: true }
  },
}
