import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface ChangeCodeLanguagePayload {
  nodeFrom: number
  newLang: string
}

export const changeCodeLanguageCommand: EditorCommand<ChangeCodeLanguagePayload> = {
  id: 'editor.changeCodeLanguage',

  execute(ctx: CommandContext, payload: ChangeCodeLanguagePayload): CommandResult {
    const { adapter } = ctx
    const { nodeFrom, newLang } = payload

    const line = adapter.getLineAt(nodeFrom)
    // Match an optional blockquote prefix, the opening code fence, optional
    // whitespace, and an optional language tag at the start of the line.
    const match = line.text.match(/^(> ?)?(`{3,})\s*(\S*)/)
    if (!match) {
      return { success: false }
    }

    const prefixLen = (match[1] ?? '').length
    const fenceLen = match[2].length
    const existingLang = match[3]
    const codeMarkEnd = line.from + prefixLen + fenceLen

    if (existingLang) {
      const whitespaceLen = match[0].length - prefixLen - fenceLen - existingLang.length
      const langFrom = codeMarkEnd + whitespaceLen
      adapter.replaceRange({
        from: langFrom,
        to: langFrom + existingLang.length,
        insert: newLang,
      })
    } else {
      adapter.replaceRange({
        from: codeMarkEnd,
        to: codeMarkEnd,
        insert: ' ' + newLang,
      })
    }

    adapter.focus()
    return { success: true }
  },
}
