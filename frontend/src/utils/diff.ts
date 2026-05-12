export interface DiffLine {
  type: 'context' | 'removed' | 'added'
  oldNumber: number | null
  newNumber: number | null
  content: string
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

function longestCommonSubsequence<T>(a: T[], b: T[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp
}

function backtrackLCS<T>(dp: number[][], a: T[], b: T[], i: number, j: number): { type: 'same' | 'removed' | 'added'; value: T }[] {
  const result: { type: 'same' | 'removed' | 'added'; value: T }[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'same', value: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: b[j - 1] })
      j--
    } else {
      result.unshift({ type: 'removed', value: a[i - 1] })
      i--
    }
  }

  return result
}

export function computeDiff(original: string, modified: string): DiffHunk[] {
  const oldLines = original.split('\n')
  const newLines = modified.split('\n')

  // Handle empty documents
  if (oldLines.length === 1 && oldLines[0] === '' && newLines.length === 1 && newLines[0] === '') {
    return []
  }
  if (oldLines.length === 1 && oldLines[0] === '') {
    return [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: newLines.length,
      lines: newLines.map((content, i) => ({
        type: 'added' as const,
        oldNumber: null,
        newNumber: i + 1,
        content,
      })),
    }]
  }
  if (newLines.length === 1 && newLines[0] === '') {
    return [{
      oldStart: 1,
      oldCount: oldLines.length,
      newStart: 0,
      newCount: 0,
      lines: oldLines.map((content, i) => ({
        type: 'removed' as const,
        oldNumber: i + 1,
        newNumber: null,
        content,
      })),
    }]
  }

  const dp = longestCommonSubsequence(oldLines, newLines)
  const lcs = backtrackLCS(dp, oldLines, newLines, oldLines.length, newLines.length)

  // Group into hunks
  const hunks: DiffHunk[] = []
  let currentHunk: DiffLine[] = []
  let oldLineNum = 1
  let newLineNum = 1
  let hunkOldStart = 1
  let hunkNewStart = 1
  let inHunk = false

  const CONTEXT_LINES = 3

  function flushHunk() {
    if (currentHunk.length === 0) return

    // Add context lines before
    const hasChanges = currentHunk.some(l => l.type !== 'context')
    if (!hasChanges) {
      currentHunk = []
      inHunk = false
      return
    }

    // Trim leading/trailing context lines
    let start = 0
    while (start < currentHunk.length && currentHunk[start].type === 'context') {
      start++
    }
    let end = currentHunk.length - 1
    while (end >= 0 && currentHunk[end].type === 'context') {
      end--
    }

    const trimmedLines = currentHunk.slice(start, end + 1)
    if (trimmedLines.length === 0) {
      currentHunk = []
      inHunk = false
      return
    }

    // Recompute line numbers for trimmed hunk
    const oldNumbers = trimmedLines.filter(l => l.oldNumber !== null).map(l => l.oldNumber!)
    const newNumbers = trimmedLines.filter(l => l.newNumber !== null).map(l => l.newNumber!)

    hunks.push({
      oldStart: oldNumbers.length > 0 ? oldNumbers[0] : hunkOldStart,
      oldCount: oldNumbers.length,
      newStart: newNumbers.length > 0 ? newNumbers[0] : hunkNewStart,
      newCount: newNumbers.length,
      lines: trimmedLines,
    })

    currentHunk = []
    inHunk = false
  }

  let contextBuffer: DiffLine[] = []

  for (const item of lcs) {
    if (item.type === 'same') {
      const line: DiffLine = {
        type: 'context',
        oldNumber: oldLineNum,
        newNumber: newLineNum,
        content: item.value,
      }

      if (inHunk) {
        // After a change, buffer context lines
        contextBuffer.push(line)
        if (contextBuffer.length > CONTEXT_LINES) {
          // Flush current hunk with context
          currentHunk.push(...contextBuffer.slice(0, -CONTEXT_LINES))
          flushHunk()
          // Start new context buffer
          contextBuffer = contextBuffer.slice(-CONTEXT_LINES)
          hunkOldStart = contextBuffer[0].oldNumber ?? oldLineNum
          hunkNewStart = contextBuffer[0].newNumber ?? newLineNum
        }
      } else {
        // Before any change, just buffer context
        contextBuffer.push(line)
        if (contextBuffer.length > CONTEXT_LINES) {
          contextBuffer.shift()
        }
        hunkOldStart = oldLineNum - Math.min(contextBuffer.length, CONTEXT_LINES) + 1
        hunkNewStart = newLineNum - Math.min(contextBuffer.length, CONTEXT_LINES) + 1
      }

      oldLineNum++
      newLineNum++
    } else {
      // Change detected
      if (!inHunk) {
        inHunk = true
        currentHunk = [...contextBuffer]
        contextBuffer = []
      } else {
        currentHunk.push(...contextBuffer)
        contextBuffer = []
      }

      if (item.type === 'removed') {
        currentHunk.push({
          type: 'removed',
          oldNumber: oldLineNum,
          newNumber: null,
          content: item.value,
        })
        oldLineNum++
      } else {
        currentHunk.push({
          type: 'added',
          oldNumber: null,
          newNumber: newLineNum,
          content: item.value,
        })
        newLineNum++
      }
    }
  }

  // Flush remaining
  if (inHunk) {
    currentHunk.push(...contextBuffer.slice(0, CONTEXT_LINES))
    flushHunk()
  }

  return hunks
}

export function applyHunks(original: string, hunks: DiffHunk[], acceptedHunkIndices: Set<number>): string {
  const lines = original.split('\n')
  const result: string[] = []
  let lineIdx = 0

  for (let hunkIdx = 0; hunkIdx < hunks.length; hunkIdx++) {
    const hunk = hunks[hunkIdx]
    const accepted = acceptedHunkIndices.has(hunkIdx)

    // Add context lines before this hunk
    const hunkStartLine = (hunk.oldStart || hunk.newStart) - 1
    while (lineIdx < hunkStartLine && lineIdx < lines.length) {
      result.push(lines[lineIdx])
      lineIdx++
    }

    if (accepted) {
      // Apply the hunk: skip removed lines, add added lines
      for (const diffLine of hunk.lines) {
        if (diffLine.type === 'context') {
          result.push(diffLine.content)
          lineIdx++
        } else if (diffLine.type === 'removed') {
          lineIdx++
        } else if (diffLine.type === 'added') {
          result.push(diffLine.content)
        }
      }
    } else {
      // Reject the hunk: keep original lines, skip added lines
      for (const diffLine of hunk.lines) {
        if (diffLine.type === 'context') {
          result.push(diffLine.content)
          lineIdx++
        } else if (diffLine.type === 'removed') {
          result.push(diffLine.content)
          lineIdx++
        } else if (diffLine.type === 'added') {
          // Skip added lines
        }
      }
    }
  }

  // Add remaining lines
  while (lineIdx < lines.length) {
    result.push(lines[lineIdx])
    lineIdx++
  }

  return result.join('\n')
}
