import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

// Track the mock editor adapter so tests can inspect adapter calls
let mockDocString = ''
let mockSelection = { anchor: 0, head: 0 }
let editorAdapterValue: any = null

const mockReplaceRange = vi.fn()
const mockGetContent = vi.fn(() => mockDocString)
const mockGetSelectedText = vi.fn(() => {
  if (mockSelection.anchor === mockSelection.head) return null
  const from = Math.min(mockSelection.anchor, mockSelection.head)
  const to = Math.max(mockSelection.anchor, mockSelection.head)
  return mockDocString.slice(from, to)
})
const mockGetSelection = vi.fn(() => mockSelection)

const mockEditorAdapter = {
  getContent: mockGetContent,
  getSelectedText: mockGetSelectedText,
  getSelection: mockGetSelection,
  replaceRange: mockReplaceRange,
}

// Mock useEditorState with a controllable editorAdapter ref
vi.mock('../useEditorState', () => ({
  useEditorState: () => ({
    editorAdapter: ref(editorAdapterValue),
  }),
}))

import { useAIEdit, getModifiedDocument } from '../useAIEdit'

function resetMockEditor(doc: string, sel?: { from: number; to: number }) {
  mockDocString = doc
  mockSelection = sel
    ? { anchor: sel.from, head: sel.to }
    : { anchor: 0, head: 0 }
  editorAdapterValue = mockEditorAdapter
  mockReplaceRange.mockClear()
}

describe('parseSearchReplaceBlocks (via getModifiedDocument)', () => {
  it('parses a valid search/replace block', () => {
    const original = 'hello world'
    const aiResponse = '<<<<<<< SEARCH\nhello\n=======\nhi\n>>>>>>> REPLACE'
    const result = getModifiedDocument(original, aiResponse)
    expect(result).toBe('hi world')
  })

  it('returns AI response as-is when no blocks present', () => {
    const original = 'hello world'
    const aiResponse = 'just some plain text'
    const result = getModifiedDocument(original, aiResponse)
    expect(result).toBe('just some plain text')
  })

  it('parses multiple blocks', () => {
    const original = 'foo bar baz'
    const aiResponse =
      '<<<<<<< SEARCH\nfoo\n=======\nalpha\n>>>>>>> REPLACE\n' +
      '<<<<<<< SEARCH\nbaz\n=======\nomega\n>>>>>>> REPLACE'
    const result = getModifiedDocument(original, aiResponse)
    expect(result).toBe('alpha bar omega')
  })

  it('skips block whose search text is not found', () => {
    const original = 'hello world'
    const aiResponse =
      '<<<<<<< SEARCH\nnotfound\n=======\nreplacement\n>>>>>>> REPLACE'
    const result = getModifiedDocument(original, aiResponse)
    expect(result).toBe('hello world')
  })

  it('applies some blocks and skips missing ones', () => {
    const original = 'hello world foo'
    const aiResponse =
      '<<<<<<< SEARCH\nmissing\n=======\nX\n>>>>>>> REPLACE\n' +
      '<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE'
    const result = getModifiedDocument(original, aiResponse)
    expect(result).toBe('hello world bar')
  })
})

describe('getModifiedDocument', () => {
  it('returns full AI response when no blocks', () => {
    expect(getModifiedDocument('original', 'full rewrite')).toBe('full rewrite')
  })

  it('applies single block correctly', () => {
    const original = 'The quick brown fox'
    const ai = '<<<<<<< SEARCH\nquick\n=======\nslow\n>>>>>>> REPLACE'
    expect(getModifiedDocument(original, ai)).toBe('The slow brown fox')
  })

  it('applies multiple non-overlapping blocks', () => {
    const original = 'a b c d'
    const ai =
      '<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n' +
      '<<<<<<< SEARCH\nc\n=======\nC\n>>>>>>> REPLACE'
    expect(getModifiedDocument(original, ai)).toBe('A b C d')
  })
})

describe('useAIEdit - applyEdit', () => {
  beforeEach(() => {
    resetMockEditor('hello world')
  })

  it('applies full document edit when isSelectionEdit is false', () => {
    const { applyEdit } = useAIEdit()
    const result = applyEdit('new content', false)

    expect(result).toBe(true)
    expect(mockReplaceRange).toHaveBeenCalledTimes(1)
    expect(mockReplaceRange).toHaveBeenCalledWith(
      { from: 0, to: 11, insert: 'new content' },
      { selection: { anchor: 11 } },
    )
  })

  it('applies selection edit when isSelectionEdit is true with from/to', () => {
    const { applyEdit } = useAIEdit()
    const result = applyEdit('inserted', true, 2, 7)

    expect(result).toBe(true)
    expect(mockReplaceRange).toHaveBeenCalledTimes(1)
    expect(mockReplaceRange).toHaveBeenCalledWith(
      { from: 2, to: 7, insert: 'inserted' },
      { selection: { anchor: 10 } },
    )
  })

  it('returns false when editorAdapter is null', () => {
    editorAdapterValue = null

    const { applyEdit } = useAIEdit()
    const result = applyEdit('content', false)

    expect(result).toBe(false)
    expect(mockReplaceRange).not.toHaveBeenCalled()

    // restore for other tests
    editorAdapterValue = mockEditorAdapter
  })
})

describe('useAIEdit - applyChanges', () => {
  beforeEach(() => {
    resetMockEditor('alpha beta gamma delta')
  })

  it('applies single replace change', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([{ search: 'beta', replace: 'BETA', position: 'replace' }])

    expect(applied).toBe(1)
    expect(mockReplaceRange).toHaveBeenCalledTimes(1)
    const call = mockReplaceRange.mock.calls[0]
    expect(call[0].insert).toBe('alpha BETA gamma delta')
  })

  it('applies multiple changes in reverse document order', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([
      { search: 'alpha', replace: 'A', position: 'replace' },
      { search: 'delta', replace: 'D', position: 'replace' },
    ])

    expect(applied).toBe(2)
    expect(mockReplaceRange).toHaveBeenCalledTimes(1)
    const call = mockReplaceRange.mock.calls[0]
    expect(call[0].insert).toBe('A beta gamma D')
  })

  it('uses originalIndex tiebreaker when search text appears multiple times', () => {
    // Document has two "a"s at indices 0 and 4.
    // Both changes find "a" at index 0 (first occurrence) for sorting.
    // Sort tiebreaker: higher originalIndex comes first.
    // Change 1 (originalIndex 1) is applied first, replacing first "a" with "Y".
    // Change 0 (originalIndex 0) is applied second, replacing second "a" with "X".
    resetMockEditor('a b a c')
    const { applyChanges } = useAIEdit()

    const applied = applyChanges([
      { search: 'a', replace: 'X', position: 'replace' },
      { search: 'a', replace: 'Y', position: 'replace' },
    ])

    expect(applied).toBe(2)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    // Change 1 applied first: "Y b a c"
    // Change 0 applied second: "Y b X c"
    expect(insert).toBe('Y b X c')
  })

  it('applies changes with position before', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([{ search: 'beta', replace: 'PRE ', position: 'before' }])

    expect(applied).toBe(1)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('alpha PRE beta gamma delta')
  })

  it('applies changes with position after', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([{ search: 'beta', replace: ' POST', position: 'after' }])

    expect(applied).toBe(1)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('alpha beta POST gamma delta')
  })

  it('skips change when search not found but applies others', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([
      { search: 'missing', replace: 'X', position: 'replace' },
      { search: 'gamma', replace: 'G', position: 'replace' },
    ])

    expect(applied).toBe(1)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('alpha beta G delta')
  })

  it('returns 0 and does not replaceRange when no changes applied', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([
      { search: 'missing1', replace: 'X', position: 'replace' },
      { search: 'missing2', replace: 'Y', position: 'replace' },
    ])

    expect(applied).toBe(0)
    expect(mockReplaceRange).not.toHaveBeenCalled()
  })

  it('handles overlapping changes via sorted order', () => {
    // "alpha beta" starts at 0, "beta" starts at 6
    // Changes overlap conceptually but are applied in reverse index order
    resetMockEditor('alpha beta gamma')
    const { applyChanges } = useAIEdit()

    const applied = applyChanges([
      { search: 'alpha beta', replace: 'AB', position: 'replace' },
      { search: 'beta', replace: 'B', position: 'replace' },
    ])

    // Sorted: "beta" at index 6 first, then "alpha beta" at index 0
    // After "beta" -> "B": "alpha B gamma"
    // Then "alpha beta" is no longer found (doc is "alpha B gamma"), so skipped
    expect(applied).toBe(1)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('alpha B gamma')
  })

  it('defaults to replace when position is omitted', () => {
    const { applyChanges } = useAIEdit()
    const applied = applyChanges([{ search: 'beta', replace: 'B' }])

    expect(applied).toBe(1)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('alpha B gamma delta')
  })
})

describe('useAIEdit - applySearchReplace', () => {
  beforeEach(() => {
    resetMockEditor('foo bar baz')
  })

  it('parses and applies search/replace blocks', () => {
    const { applySearchReplace } = useAIEdit()
    const content = '<<<<<<< SEARCH\nbar\n=======\nBAR\n>>>>>>> REPLACE'
    const applied = applySearchReplace(content)

    expect(applied).toBe(1)
    expect(mockReplaceRange).toHaveBeenCalledTimes(1)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('foo BAR baz')
  })

  it('returns 0 when no blocks found', () => {
    const { applySearchReplace } = useAIEdit()
    const applied = applySearchReplace('plain text without blocks')

    expect(applied).toBe(0)
    expect(mockReplaceRange).not.toHaveBeenCalled()
  })

  it('applies multiple blocks from content', () => {
    const { applySearchReplace } = useAIEdit()
    const content =
      '<<<<<<< SEARCH\nfoo\n=======\nFOO\n>>>>>>> REPLACE\n' +
      '<<<<<<< SEARCH\nbaz\n=======\nBAZ\n>>>>>>> REPLACE'
    const applied = applySearchReplace(content)

    expect(applied).toBe(2)
    const insert = mockReplaceRange.mock.calls[0][0].insert
    expect(insert).toBe('FOO bar BAZ')
  })
})

describe('useAIEdit - getCurrentDocument', () => {
  it('returns document text from adapter', () => {
    resetMockEditor('document content')
    const { getCurrentDocument } = useAIEdit()
    expect(getCurrentDocument()).toBe('document content')
  })

  it('returns empty string when editorAdapter is null', () => {
    editorAdapterValue = null

    const { getCurrentDocument } = useAIEdit()
    expect(getCurrentDocument()).toBe('')

    editorAdapterValue = mockEditorAdapter
  })
})

describe('useAIEdit - getSelection', () => {
  it('returns null when selection is empty', () => {
    resetMockEditor('hello world')
    const { getSelection } = useAIEdit()
    expect(getSelection()).toBeNull()
  })

  it('returns selection info when text is selected', () => {
    resetMockEditor('hello world', { from: 6, to: 11 })
    const { getSelection } = useAIEdit()
    expect(getSelection()).toEqual({
      text: 'world',
      from: 6,
      to: 11,
    })
  })

  it('returns null when editorAdapter is null', () => {
    editorAdapterValue = null

    const { getSelection } = useAIEdit()
    expect(getSelection()).toBeNull()

    editorAdapterValue = mockEditorAdapter
  })
})
