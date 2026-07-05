export function moveLines(
  text: string,
  sourceLineFrom: number,
  sourceLineTo: number,
  targetLine: number,
): string {
  const lines = text.split('\n')
  const count = sourceLineTo - sourceLineFrom + 1
  const moved = lines.splice(sourceLineFrom - 1, count)

  let insertIdx: number
  if (targetLine > sourceLineTo) {
    insertIdx = targetLine - 1 - count
  } else {
    insertIdx = targetLine - 1
  }
  insertIdx = Math.max(0, Math.min(insertIdx, lines.length))

  lines.splice(insertIdx, 0, ...moved)

  let result = lines.join('\n')
  if (!text.endsWith('\n') && result.endsWith('\n')) {
    result = result.replace(/\n+$/, '')
  }
  return result
}
