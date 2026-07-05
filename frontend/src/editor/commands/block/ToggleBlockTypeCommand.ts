import { BlockType, blockPrefixMap } from '../../../utils/syntaxUtils'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface ToggleBlockTypePayload {
  prefix: string
}

export const toggleBlockTypeCommand: EditorCommand<ToggleBlockTypePayload> = {
  id: 'editor.toggleBlockType',

  execute(ctx: CommandContext, payload: ToggleBlockTypePayload): CommandResult {
    const { adapter, semantics } = ctx
    const { prefix } = payload
    const sel = adapter.getSelection()
    const line = adapter.getLineAt(sel.head)
    const blockType = semantics.getBlockTypeAtLine(line)

    // Code blocks have multi-line prefixes that can't be toggled inline
    if (blockType === BlockType.FencedCode) {
      return { success: false }
    }

    const currentPrefix = blockPrefixMap[blockType] ?? ''

    if (currentPrefix) {
      // Has existing block prefix — replace or remove
      const newPrefix = currentPrefix === prefix ? '' : prefix
      adapter.replaceRange(
        { from: line.from, to: line.from + currentPrefix.length, insert: newPrefix },
        { selection: { anchor: line.from + newPrefix.length } },
      )
    } else {
      // Plain paragraph — insert prefix
      adapter.replaceRange(
        { from: line.from, to: line.from, insert: prefix },
        { selection: { anchor: line.from + prefix.length } },
      )
    }
    adapter.focus()
    return { success: true }
  },
}
