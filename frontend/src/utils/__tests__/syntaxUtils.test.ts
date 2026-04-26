import { describe, it, expect, afterEach } from 'vitest'
import { BlockType, getBlockType, getBlockTypeAtLine, isFullBlockSelection, blockTypeToLabel, blockPrefixMap } from '../syntaxUtils'
import { createView } from '../../test-utils/helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('getBlockType', () => {
  it('detects H1', () => {
    const view = createView('# Title')
    expect(getBlockType(view, 2)).toBe(BlockType.H1)
  })

  it('detects H2', () => {
    const view = createView('## Section')
    expect(getBlockType(view, 3)).toBe(BlockType.H2)
  })

  it('detects H3', () => {
    const view = createView('### Sub')
    expect(getBlockType(view, 4)).toBe(BlockType.H3)
  })

  it('detects H4', () => {
    const view = createView('#### Deep')
    expect(getBlockType(view, 5)).toBe(BlockType.H4)
  })

  it('detects Paragraph', () => {
    const view = createView('Just text')
    expect(getBlockType(view, 3)).toBe(BlockType.Paragraph)
  })

  it('detects BulletList', () => {
    const view = createView('- Item')
    expect(getBlockType(view, 2)).toBe(BlockType.BulletList)
  })

  it('detects OrderedList', () => {
    const view = createView('1. Item')
    expect(getBlockType(view, 3)).toBe(BlockType.OrderedList)
  })

  it('detects Todo', () => {
    const view = createView('- [ ] Task')
    expect(getBlockType(view, 6)).toBe(BlockType.Todo)
  })

  it('detects checked Todo', () => {
    const view = createView('- [x] Done')
    expect(getBlockType(view, 6)).toBe(BlockType.Todo)
  })

  it('detects Blockquote', () => {
    const view = createView('> Quote text')
    expect(getBlockType(view, 2)).toBe(BlockType.Blockquote)
  })

  it('detects FencedCode', () => {
    const view = createView('```\ncode\n```')
    expect(getBlockType(view, 5)).toBe(BlockType.FencedCode)
  })

  it('detects HorizontalRule', () => {
    const view = createView('---')
    expect(getBlockType(view, 1)).toBe(BlockType.HorizontalRule)
  })

  it('detects Table', () => {
    const view = createView('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(getBlockType(view, 2)).toBe(BlockType.Table)
  })

  it('detects MathBlock', () => {
    const view = createView('$$\nE=mc^2\n$$')
    expect(getBlockType(view, 0)).toBe(BlockType.MathBlock)
  })

  it('detects MathBlock with leading spaces', () => {
    const view = createView('  $$\nE=mc^2\n$$')
    expect(getBlockType(view, 2)).toBe(BlockType.MathBlock)
  })

  it('does not detect MathBlock for plain text starting with $', () => {
    const view = createView('$100 price')
    expect(getBlockType(view, 0)).toBe(BlockType.Paragraph)
  })

  it('detects type at line end', () => {
    const view = createView('# Title')
    expect(getBlockType(view, 7)).toBe(BlockType.H1)
  })

  it('detects type in multi-line doc', () => {
    const view = createView('# Heading\n\nParagraph\n\n- List item')
    expect(getBlockType(view, 2)).toBe(BlockType.H1)
    expect(getBlockType(view, 13)).toBe(BlockType.Paragraph)
    expect(getBlockType(view, 27)).toBe(BlockType.BulletList)
  })

  it('returns Paragraph for empty line', () => {
    const view = createView('')
    expect(getBlockType(view, 0)).toBe(BlockType.Paragraph)
  })
})

describe('getBlockTypeAtLine', () => {
  it('uses line start position', () => {
    const view = createView('# Title')
    const line = view.state.doc.line(1)
    expect(getBlockTypeAtLine(view, line)).toBe(BlockType.H1)
  })

  it('works for second line', () => {
    const view = createView('Text\n- List')
    const line = view.state.doc.line(2)
    expect(getBlockTypeAtLine(view, line)).toBe(BlockType.BulletList)
  })
})

describe('isFullBlockSelection', () => {
  it('returns true when entire line content selected', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 0, head: 11 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(true)
  })

  it('returns true for full line in list (after mark)', () => {
    const view = createView('- Item text')
    // Mark is at 0-2 (" "), content starts at 2
    view.dispatch({ selection: { anchor: 2, head: 11 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(true)
  })

  it('returns true for full line including mark', () => {
    const view = createView('- Item text')
    view.dispatch({ selection: { anchor: 0, head: 11 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(true)
  })

  it('returns false for partial selection', () => {
    const view = createView('Hello World')
    view.dispatch({ selection: { anchor: 0, head: 5 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(false)
  })

  it('returns false for single word in list', () => {
    const view = createView('- Item text')
    view.dispatch({ selection: { anchor: 2, head: 6 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(false)
  })

  it('returns true for heading full selection', () => {
    const view = createView('# Title')
    view.dispatch({ selection: { anchor: 0, head: 7 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(true)
  })

  it('heading partial selection covers all content', () => {
    const view = createView('# Title')
    view.dispatch({ selection: { anchor: 2, head: 7 } })
    // Selecting "Title" after "# " covers all heading content
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(true)
  })

  it('handles todo line', () => {
    const view = createView('- [ ] Task')
    view.dispatch({ selection: { anchor: 0, head: 10 } })
    expect(isFullBlockSelection(view, view.state.selection.main)).toBe(true)
  })
})

describe('blockTypeToLabel', () => {
  it('maps Paragraph to Text', () => {
    expect(blockTypeToLabel(BlockType.Paragraph)).toBe('Text')
  })

  it('maps H1-H4 directly', () => {
    expect(blockTypeToLabel(BlockType.H1)).toBe('H1')
    expect(blockTypeToLabel(BlockType.H2)).toBe('H2')
    expect(blockTypeToLabel(BlockType.H3)).toBe('H3')
    expect(blockTypeToLabel(BlockType.H4)).toBe('H4')
  })

  it('maps BulletList to List', () => {
    expect(blockTypeToLabel(BlockType.BulletList)).toBe('List')
  })

  it('maps OrderedList', () => {
    expect(blockTypeToLabel(BlockType.OrderedList)).toBe('OrderedList')
  })

  it('maps Todo', () => {
    expect(blockTypeToLabel(BlockType.Todo)).toBe('Todo')
  })

  it('maps Blockquote to Quote', () => {
    expect(blockTypeToLabel(BlockType.Blockquote)).toBe('Quote')
  })

  it('maps FencedCode to Code', () => {
    expect(blockTypeToLabel(BlockType.FencedCode)).toBe('Code')
  })
})

describe('blockPrefixMap', () => {
  it('has prefix for H1', () => {
    expect(blockPrefixMap[BlockType.H1]).toBe('# ')
  })

  it('has prefix for BulletList', () => {
    expect(blockPrefixMap[BlockType.BulletList]).toBe('- ')
  })

  it('has prefix for OrderedList', () => {
    expect(blockPrefixMap[BlockType.OrderedList]).toBe('1. ')
  })

  it('has prefix for Blockquote', () => {
    expect(blockPrefixMap[BlockType.Blockquote]).toBe('> ')
  })

  it('has prefix for FencedCode', () => {
    expect(blockPrefixMap[BlockType.FencedCode]).toBe('```text\n')
  })
})
