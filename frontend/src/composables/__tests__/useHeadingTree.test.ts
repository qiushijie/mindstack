import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'

vi.mock('../useEditorState', () => ({
  scrollToLine: vi.fn(),
}))

import { parseHeadings, setCurrentHeadings, useHeadingTree } from '../useHeadingTree'

describe('useHeadingTree', () => {
  describe('parseHeadings', () => {
    it('returns empty array for undefined', () => {
      expect(parseHeadings(undefined)).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(parseHeadings('')).toEqual([])
    })

    it('parses h1 heading', () => {
      const result = parseHeadings('# Hello World')
      expect(result).toEqual([{ text: 'Hello World', level: 1, line: 1 }])
    })

    it('parses multiple headings', () => {
      const content = '# Title\n\n## Section 1\n\n### Subsection\n\n## Section 2'
      const result = parseHeadings(content)
      expect(result).toHaveLength(4)
      expect(result[0]).toEqual({ text: 'Title', level: 1, line: 1 })
      expect(result[1]).toEqual({ text: 'Section 1', level: 2, line: 3 })
      expect(result[2]).toEqual({ text: 'Subsection', level: 3, line: 5 })
      expect(result[3]).toEqual({ text: 'Section 2', level: 2, line: 7 })
    })

    it('parses all heading levels h1-h6', () => {
      const content = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6'
      const result = parseHeadings(content)
      expect(result).toHaveLength(6)
      for (let i = 0; i < 6; i++) {
        expect(result[i].level).toBe(i + 1)
        expect(result[i].text).toBe(`H${i + 1}`)
        expect(result[i].line).toBe(i + 1)
      }
    })

    it('ignores non-heading lines', () => {
      const content = 'Some text\n# Heading\nMore text\n## Another'
      const result = parseHeadings(content)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ text: 'Heading', level: 1, line: 2 })
      expect(result[1]).toEqual({ text: 'Another', level: 2, line: 4 })
    })

    it('trims heading text', () => {
      const result = parseHeadings('#  Trimmed  ')
      expect(result[0].text).toBe('Trimmed')
    })

    it('does not parse more than 6 hashes', () => {
      const result = parseHeadings('####### Not a heading')
      expect(result).toEqual([])
    })
  })

  describe('setCurrentHeadings and useHeadingTree', () => {
    beforeEach(() => {
      setCurrentHeadings('')
    })

    it('updates headings via setCurrentHeadings', () => {
      const { headings } = useHeadingTree()
      expect(headings.value).toEqual([])

      setCurrentHeadings('# Title\n## Section')
      expect(headings.value).toHaveLength(2)
      expect(headings.value[0].text).toBe('Title')
      expect(headings.value[1].text).toBe('Section')
    })

    it('returns reactive headings', () => {
      const { headings } = useHeadingTree()
      setCurrentHeadings('# First')
      expect(headings.value[0].text).toBe('First')

      setCurrentHeadings('# Second')
      expect(headings.value[0].text).toBe('Second')
    })
  })
})
