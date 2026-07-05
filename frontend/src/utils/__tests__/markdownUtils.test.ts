import { describe, it, expect } from 'vitest'
import { moveLines } from '../markdownUtils'

describe('moveLines', () => {
  it('moves a block down past another', () => {
    const result = moveLines('# Heading\n\nParagraph\n\n- List', 1, 1, 4)
    expect(result).toBe('\nParagraph\n# Heading\n\n- List')
  })

  it('moves a block up before another', () => {
    const result = moveLines('# Heading\n\nParagraph\n\n- List', 3, 3, 1)
    expect(result).toBe('Paragraph\n# Heading\n\n\n- List')
  })

  it('moves a multi-line block (code fence)', () => {
    const result = moveLines('```\ncode\n```\n\n- Item', 1, 3, 6)
    expect(result).toBe('\n- Item\n```\ncode\n```')
  })

  it('no-op when target equals source', () => {
    const original = '# Heading\n\nParagraph'
    const result = moveLines(original, 1, 1, 1)
    expect(result).toBe(original)
  })

  it('moves last block to top', () => {
    const result = moveLines('A\n\nB\n\nC', 5, 5, 1)
    expect(result).toBe('C\nA\n\nB')
  })

  it('moves first block to bottom', () => {
    const result = moveLines('A\n\nB\n\nC', 1, 1, 6)
    expect(result).toBe('\nB\n\nC\nA')
  })

  it('handles two-line document', () => {
    expect(moveLines('A\nB', 2, 2, 1)).toBe('B\nA')
  })

  it('handles single line', () => {
    expect(moveLines('Hello', 1, 1, 1)).toBe('Hello')
  })

  it('preserves trailing newline', () => {
    expect(moveLines('A\nB\n', 1, 1, 3).endsWith('\n')).toBe(true)
  })

  it('moves multi-line block up', () => {
    const result = moveLines('A\n\n```\ncode\n```\n\nB', 3, 5, 1)
    expect(result).toBe('```\ncode\n```\nA\n\n\nB')
  })

  it('handles moving block to same position via target greater than source', () => {
    const result = moveLines('A\nB\nC', 1, 1, 2)
    expect(result).toBe('A\nB\nC')
  })
})
