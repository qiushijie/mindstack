import { describe, it, expect } from 'vitest'
import { computeDiff, applyHunks } from '../diff'

describe('diff', () => {
  describe('computeDiff', () => {
    it('returns empty for identical content', () => {
      const hunks = computeDiff('hello\nworld', 'hello\nworld')
      expect(hunks).toHaveLength(0)
    })

    it('detects single line change', () => {
      const hunks = computeDiff('hello\nworld', 'hello\nuniverse')
      expect(hunks).toHaveLength(1)
      expect(hunks[0].lines).toHaveLength(2)
      expect(hunks[0].lines[0]).toMatchObject({ type: 'removed', content: 'world' })
      expect(hunks[0].lines[1]).toMatchObject({ type: 'added', content: 'universe' })
    })

    it('detects added lines', () => {
      const hunks = computeDiff('hello', 'hello\nworld')
      expect(hunks).toHaveLength(1)
      const addedLines = hunks[0].lines.filter(l => l.type === 'added')
      expect(addedLines).toHaveLength(1)
      expect(addedLines[0].content).toBe('world')
    })

    it('detects removed lines', () => {
      const hunks = computeDiff('hello\nworld', 'hello')
      expect(hunks).toHaveLength(1)
      const removedLines = hunks[0].lines.filter(l => l.type === 'removed')
      expect(removedLines).toHaveLength(1)
      expect(removedLines[0].content).toBe('world')
    })

    it('handles multiple hunks', () => {
      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10'
      const modified = 'line1\nchanged2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nchanged10'
      const hunks = computeDiff(original, modified)
      // Changes far apart should be separate hunks
      expect(hunks.length).toBeGreaterThanOrEqual(1)
      expect(hunks.some(h => h.lines.some(l => l.content === 'changed2'))).toBe(true)
      expect(hunks.some(h => h.lines.some(l => l.content === 'changed10'))).toBe(true)
    })

    it('detects line changes correctly', () => {
      const original = 'a\nb\nc\nd\ne'
      const modified = 'a\nb\nc\nCHANGED\ne'
      const hunks = computeDiff(original, modified)
      expect(hunks).toHaveLength(1)
      // Should detect the removed and added line
      expect(hunks[0].lines.some(l => l.type === 'removed' && l.content === 'd')).toBe(true)
      expect(hunks[0].lines.some(l => l.type === 'added' && l.content === 'CHANGED')).toBe(true)
    })
  })

  describe('applyHunks', () => {
    it('applies accepted hunks and rejects rejected hunks', () => {
      const original = 'hello\nworld\nfoo\nbar\nqux\nquux'
      const modified = 'hello\nuniverse\nfoo\nbaz\nqux\nquux'
      const hunks = computeDiff(original, modified)
      expect(hunks.length).toBeGreaterThanOrEqual(1)

      // Accept first hunk (world -> universe), reject any others
      const accepted = new Set([0])
      const result = applyHunks(original, hunks, accepted)
      expect(result).toContain('universe')
    })

    it('applies all hunks when all accepted', () => {
      const original = 'hello\nworld'
      const modified = 'hi\nuniverse'
      const hunks = computeDiff(original, modified)
      const accepted = new Set(hunks.map((_, i) => i))
      const result = applyHunks(original, hunks, accepted)
      expect(result).toBe('hi\nuniverse')
    })

    it('keeps original when all rejected', () => {
      const original = 'hello\nworld'
      const modified = 'hi\nuniverse'
      const hunks = computeDiff(original, modified)
      const accepted = new Set<number>()
      const result = applyHunks(original, hunks, accepted)
      expect(result).toBe('hello\nworld')
    })

    it('handles empty documents', () => {
      const hunks = computeDiff('', 'hello')
      expect(hunks).toHaveLength(1)
      const accepted = new Set([0])
      const result = applyHunks('', hunks, accepted)
      expect(result).toContain('hello')
    })
  })
})
