import { moveLines } from '../../../utils/markdownUtils'
import type { CommandContext, CommandResult, EditorCommand } from '../types'

export interface MoveBlockPayload {
  sourceLineFrom: number
  sourceLineTo: number
  targetLine: number
}

export const moveBlockCommand: EditorCommand<MoveBlockPayload> = {
  id: 'editor.moveBlock',

  execute(ctx: CommandContext, payload: MoveBlockPayload): CommandResult {
    const { adapter } = ctx
    const { sourceLineFrom, sourceLineTo, targetLine } = payload
    const oldText = adapter.getContent()
    const newText = moveLines(oldText, sourceLineFrom, sourceLineTo, targetLine)

    if (oldText === newText) {
      adapter.focus()
      return { success: true }
    }

    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')

    // Find first different line
    let firstDiff = 0
    while (firstDiff < oldLines.length && firstDiff < newLines.length && oldLines[firstDiff] === newLines[firstDiff]) firstDiff++

    // Find last different line (from end)
    let lastDiffOld = oldLines.length - 1
    let lastDiffNew = newLines.length - 1
    while (
      lastDiffOld >= 0 &&
      lastDiffNew >= 0 &&
      lastDiffOld > firstDiff &&
      lastDiffNew > firstDiff &&
      oldLines[lastDiffOld] === newLines[lastDiffNew]
    ) {
      lastDiffOld--
      lastDiffNew--
    }

    if (firstDiff > lastDiffOld && firstDiff > lastDiffNew) {
      adapter.focus()
      return { success: true }
    }

    // Compute from position (start of first changed line)
    let fromPos = 0
    for (let i = 0; i < firstDiff; i++) fromPos += oldLines[i].length + 1

    // Compute to position (end of last old changed line)
    let toPos = fromPos
    for (let i = firstDiff; i <= lastDiffOld; i++) {
      toPos += oldLines[i].length
      if (i < lastDiffOld) toPos++
    }

    const insertText = newLines.slice(firstDiff, lastDiffNew + 1).join('\n')

    // Compute anchor: cursor at start of moved block in new text,
    // using the same insertIdx logic as moveLines.
    const count = sourceLineTo - sourceLineFrom + 1
    let insertIdx: number
    if (targetLine > sourceLineTo) {
      insertIdx = targetLine - 1 - count
    } else {
      insertIdx = targetLine - 1
    }
    insertIdx = Math.max(0, Math.min(insertIdx, newLines.length - 1))

    let anchor = 0
    for (let i = 0; i < insertIdx; i++) {
      anchor += newLines[i].length + 1
    }

    adapter.replaceRange(
      { from: fromPos, to: toPos, insert: insertText },
      { selection: { anchor } },
    )
    adapter.focus()
    return { success: true }
  },
}
