import type { CommandContext, CommandResult, EditorCommand } from '../types'

export const toggleCheckboxCommand: EditorCommand = {
  id: 'editor.toggleCheckbox',

  execute(ctx: CommandContext): CommandResult {
    const { adapter } = ctx
    const sel = adapter.getSelection()
    const line = adapter.getLineAt(sel.head)
    const match = line.text.match(/^[-*+]\s\[([ x])\]\s/)

    if (!match) {
      return { success: false }
    }

    const checked = match[1] === 'x'
    const bracketPos = line.text.indexOf('[')
    const newChar = checked ? ' ' : 'x'

    adapter.replaceRange(
      { from: line.from + bracketPos + 1, to: line.from + bracketPos + 2, insert: newChar },
    )
    adapter.focus()
    return { success: true }
  },
}
