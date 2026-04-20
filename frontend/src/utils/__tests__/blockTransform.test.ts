import { describe, it, expect } from 'vitest'
import {
  extractText,
  transformBlock,
  getInlineType,
  getActiveLabel,
  getInlineActive,
  isActive,
} from '../blockTransform'
import type { EditorBlock } from '../../types/editor'

// All block types as source
const paragraphBlock: EditorBlock = {
  type: 'paragraph',
  content: [{ type: 'text', text: 'Hello' }],
}

const headingBlock: EditorBlock = {
  type: 'heading',
  level: 2,
  content: [{ type: 'text', text: 'Title' }],
}

const bulletListBlock: EditorBlock = {
  type: 'bullet_list',
  items: [{ content: [{ type: 'text', text: 'Item' }] }],
}

const orderedListBlock: EditorBlock = {
  type: 'ordered_list',
  items: [{ content: [{ type: 'text', text: 'Item' }] }],
}

const todoListBlock: EditorBlock = {
  type: 'todo_list',
  items: [{ checked: false, content: [{ type: 'text', text: 'Todo item' }] }],
}

const codeBlock: EditorBlock = {
  type: 'code_block',
  language: 'ts',
  code: 'const x = 1',
}

const blockquoteBlock: EditorBlock = {
  type: 'blockquote',
  content: [{ type: 'text', text: 'Quote' }],
}

const allBlocks: { name: string; block: EditorBlock }[] = [
  { name: 'paragraph', block: paragraphBlock },
  { name: 'heading', block: headingBlock },
  { name: 'bullet_list', block: bulletListBlock },
  { name: 'ordered_list', block: orderedListBlock },
  { name: 'todo_list', block: todoListBlock },
  { name: 'code_block', block: codeBlock },
  { name: 'blockquote', block: blockquoteBlock },
]

// All target labels
const blockLabels = ['H1', 'H2', 'H3', 'H4', 'Text', 'List', 'OrderedList', 'Todo', 'Code', 'Quote']

describe('transformBlock: all block-to-block conversions', () => {
  for (const { name, block } of allBlocks) {
    describe(`from ${name}`, () => {
      for (const label of blockLabels) {
        it(`→ ${label} produces valid result`, () => {
          const result = transformBlock(block, label)
          expect(result).not.toBeNull()

          // Verify the type matches the label
          switch (label) {
            case 'H1':
              expect(result!.type).toBe('heading')
              if (result!.type === 'heading') expect(result!.level).toBe(1)
              break
            case 'H2':
              expect(result!.type).toBe('heading')
              if (result!.type === 'heading') expect(result!.level).toBe(2)
              break
            case 'H3':
              expect(result!.type).toBe('heading')
              if (result!.type === 'heading') expect(result!.level).toBe(3)
              break
            case 'H4':
              expect(result!.type).toBe('heading')
              if (result!.type === 'heading') expect(result!.level).toBe(4)
              break
            case 'Text':
              expect(result!.type).toBe('paragraph')
              break
            case 'List':
              expect(result!.type).toBe('bullet_list')
              break
            case 'OrderedList':
              expect(result!.type).toBe('ordered_list')
              break
            case 'Todo':
              expect(result!.type).toBe('todo_list')
              break
            case 'Code':
              expect(result!.type).toBe('code_block')
              break
            case 'Quote':
              expect(result!.type).toBe('blockquote')
              break
          }
        })

        it(`→ ${label} preserves text content`, () => {
          const result = transformBlock(block, label)
          // Every result should contain the original text somewhere
          if (result!.type === 'code_block') {
            expect(result!.code).toBeTruthy()
          } else if ('content' in result!) {
            expect(result!.content.length).toBeGreaterThan(0)
            expect(result!.content.some(c => c.text.length > 0)).toBe(true)
          } else if ('items' in result!) {
            expect(result!.items.length).toBeGreaterThan(0)
            expect(result!.items[0].content.some(c => c.text.length > 0)).toBe(true)
          }
        })
      }
    })
  }
})

describe('transformBlock: round-trip conversions', () => {
  it('paragraph → Todo → Text returns to paragraph', () => {
    const step1 = transformBlock(paragraphBlock, 'Todo')!
    expect(step1.type).toBe('todo_list')

    const step2 = transformBlock(step1, 'Text')!
    expect(step2.type).toBe('paragraph')
    if (step2.type === 'paragraph') {
      expect(step2.content[0].text).toBe('Hello')
    }
  })

  it('paragraph → Code → Text returns to paragraph', () => {
    const step1 = transformBlock(paragraphBlock, 'Code')!
    const step2 = transformBlock(step1, 'Text')!
    expect(step2.type).toBe('paragraph')
    if (step2.type === 'paragraph') {
      expect(step2.content[0].text).toBe('Hello')
    }
  })

  it('paragraph → List → Text returns to paragraph', () => {
    const step1 = transformBlock(paragraphBlock, 'List')!
    const step2 = transformBlock(step1, 'Text')!
    expect(step2.type).toBe('paragraph')
  })

  it('paragraph → OrderedList → Text returns to paragraph', () => {
    const step1 = transformBlock(paragraphBlock, 'OrderedList')!
    const step2 = transformBlock(step1, 'Text')!
    expect(step2.type).toBe('paragraph')
  })

  it('paragraph → Quote → Text returns to paragraph', () => {
    const step1 = transformBlock(paragraphBlock, 'Quote')!
    const step2 = transformBlock(step1, 'Text')!
    expect(step2.type).toBe('paragraph')
  })

  it('paragraph → H1 → Text returns to paragraph', () => {
    const step1 = transformBlock(paragraphBlock, 'H1')!
    const step2 = transformBlock(step1, 'Text')!
    expect(step2.type).toBe('paragraph')
  })

  it('todo_list → H2 → Todo returns to todo_list', () => {
    const step1 = transformBlock(todoListBlock, 'H2')!
    expect(step1.type).toBe('heading')
    const step2 = transformBlock(step1, 'Todo')!
    expect(step2.type).toBe('todo_list')
  })

  it('bullet_list → Code → List returns to bullet_list', () => {
    const step1 = transformBlock(bulletListBlock, 'Code')!
    const step2 = transformBlock(step1, 'List')!
    expect(step2.type).toBe('bullet_list')
  })

  it('code_block → Quote → Code returns to code_block', () => {
    const step1 = transformBlock(codeBlock, 'Quote')!
    const step2 = transformBlock(step1, 'Code')!
    expect(step2.type).toBe('code_block')
  })
})

describe('transformBlock: inline on non-content blocks', () => {
  it('Bold on todo_list returns null', () => {
    expect(transformBlock(todoListBlock, 'Bold')).toBeNull()
  })

  it('Italic on bullet_list returns null', () => {
    expect(transformBlock(bulletListBlock, 'Italic')).toBeNull()
  })

  it('Strikethrough on code_block returns null', () => {
    expect(transformBlock(codeBlock, 'Strikethrough')).toBeNull()
  })

  it('Bold on ordered_list returns null', () => {
    expect(transformBlock(orderedListBlock, 'Bold')).toBeNull()
  })

  it('Bold on paragraph applies inline', () => {
    const result = transformBlock(paragraphBlock, 'Bold')
    expect(result).not.toBeNull()
    if (result!.type === 'paragraph') {
      expect(result!.content[0].type).toBe('strong')
    }
    // Toggle off: applying Bold again removes strong
    const toggled = transformBlock(result!, 'Bold')
    expect(toggled).not.toBeNull()
    if (toggled!.type === 'paragraph') {
      expect(toggled!.content[0].type).toBe('text')
    }
  })

  it('Bold toggles off strong when mixed with other inline types', () => {
    const mixed: EditorBlock = {
      type: 'paragraph',
      content: [{ type: 'strong', text: 'A' }, { type: 'em', text: 'B' }],
    }
    const result = transformBlock(mixed, 'Bold')
    expect(result).not.toBeNull()
    if (result!.type === 'paragraph') {
      expect(result!.content[0].type).toBe('text')
      expect(result!.content[0].text).toBe('A')
      expect(result!.content[1].type).toBe('em') // preserved
    }
  })

  it('Bold on heading applies inline', () => {
    const result = transformBlock(headingBlock, 'Bold')
    expect(result).not.toBeNull()
    if (result!.type === 'heading') {
      expect(result!.content[0].type).toBe('strong')
    }
  })

  it('Bold on blockquote applies inline', () => {
    const result = transformBlock(blockquoteBlock, 'Bold')
    expect(result).not.toBeNull()
    if (result!.type === 'blockquote') {
      expect(result!.content[0].type).toBe('strong')
    }
  })
})

// ============================================================
// extractText — all branches
// ============================================================

describe('extractText', () => {
  it('heading with content', () => {
    const block: EditorBlock = { type: 'heading', level: 1, content: [{ type: 'text', text: 'Title' }] }
    expect(extractText(block)).toBe('Title')
  })

  it('paragraph with mixed inline', () => {
    const block: EditorBlock = {
      type: 'paragraph',
      content: [{ type: 'strong', text: 'A' }, { type: 'text', text: 'B' }],
    }
    expect(extractText(block)).toBe('AB')
  })

  it('bullet_list with items', () => {
    const block: EditorBlock = {
      type: 'bullet_list',
      items: [{ content: [{ type: 'text', text: 'X' }] }, { content: [{ type: 'text', text: 'Y' }] }],
    }
    expect(extractText(block)).toBe('X\nY')
  })

  it('ordered_list with items', () => {
    const block: EditorBlock = { type: 'ordered_list', items: [{ content: [{ type: 'text', text: 'Z' }] }] }
    expect(extractText(block)).toBe('Z')
  })

  it('todo_list with items', () => {
    const block: EditorBlock = {
      type: 'todo_list',
      items: [{ checked: true, content: [{ type: 'text', text: 'Done' }] }],
    }
    expect(extractText(block)).toBe('Done')
  })

  it('code_block with code', () => {
    const block: EditorBlock = { type: 'code_block', language: 'ts', code: 'x = 1' }
    expect(extractText(block)).toBe('x = 1')
  })

  it('blockquote with content', () => {
    const block: EditorBlock = { type: 'blockquote', content: [{ type: 'text', text: 'Q' }] }
    expect(extractText(block)).toBe('Q')
  })
})

// ============================================================
// getInlineType
// ============================================================

describe('getInlineType', () => {
  it('Bold → strong', () => { expect(getInlineType('Bold')).toBe('strong') })
  it('Italic → em', () => { expect(getInlineType('Italic')).toBe('em') })
  it('Strikethrough → del', () => { expect(getInlineType('Strikethrough')).toBe('del') })
  it('Text → null', () => { expect(getInlineType('Text')).toBeNull() })
  it('H1 → null', () => { expect(getInlineType('H1')).toBeNull() })
})

// ============================================================
// getActiveLabel — all branches
// ============================================================

describe('getActiveLabel', () => {
  it('heading level 1', () => {
    expect(getActiveLabel({ type: 'heading', level: 1, content: [{ type: 'text', text: '' }] })).toBe('H1')
  })
  it('heading level 2', () => {
    expect(getActiveLabel({ type: 'heading', level: 2, content: [{ type: 'text', text: '' }] })).toBe('H2')
  })
  it('heading level 3', () => {
    expect(getActiveLabel({ type: 'heading', level: 3, content: [{ type: 'text', text: '' }] })).toBe('H3')
  })
  it('heading level 4', () => {
    expect(getActiveLabel({ type: 'heading', level: 4, content: [{ type: 'text', text: '' }] })).toBe('H4')
  })
  it('paragraph', () => {
    expect(getActiveLabel({ type: 'paragraph', content: [{ type: 'text', text: '' }] })).toBe('Text')
  })
  it('bullet_list', () => {
    expect(getActiveLabel({ type: 'bullet_list', items: [] })).toBe('List')
  })
  it('ordered_list', () => {
    expect(getActiveLabel({ type: 'ordered_list', items: [] })).toBe('OrderedList')
  })
  it('todo_list', () => {
    expect(getActiveLabel({ type: 'todo_list', items: [] })).toBe('Todo')
  })
  it('code_block', () => {
    expect(getActiveLabel({ type: 'code_block', language: 'ts', code: '' })).toBe('Code')
  })
  it('blockquote', () => {
    expect(getActiveLabel({ type: 'blockquote', content: [{ type: 'text', text: '' }] })).toBe('Quote')
  })
  it('null', () => {
    expect(getActiveLabel(null)).toBeNull()
  })
})

// ============================================================
// getInlineActive — all branches
// ============================================================

describe('getInlineActive', () => {
  it('strong content', () => {
    expect(getInlineActive({ type: 'paragraph', content: [{ type: 'strong', text: '' }] }))
      .toEqual({ strong: true, em: false, del: false })
  })
  it('em content', () => {
    expect(getInlineActive({ type: 'paragraph', content: [{ type: 'em', text: '' }] }))
      .toEqual({ strong: false, em: true, del: false })
  })
  it('del content', () => {
    expect(getInlineActive({ type: 'paragraph', content: [{ type: 'del', text: '' }] }))
      .toEqual({ strong: false, em: false, del: true })
  })
  it('mixed strong+em', () => {
    expect(getInlineActive({ type: 'paragraph', content: [{ type: 'strong', text: '' }, { type: 'em', text: '' }] }))
      .toEqual({ strong: true, em: true, del: false })
  })
  it('plain text', () => {
    expect(getInlineActive({ type: 'paragraph', content: [{ type: 'text', text: '' }] }))
      .toEqual({ strong: false, em: false, del: false })
  })
  it('null block', () => {
    expect(getInlineActive(null)).toEqual({ strong: false, em: false, del: false })
  })
  it('code_block (no content)', () => {
    expect(getInlineActive({ type: 'code_block', language: 'ts', code: '' }))
      .toEqual({ strong: false, em: false, del: false })
  })
  it('todo_list (no content)', () => {
    expect(getInlineActive({ type: 'todo_list', items: [] }))
      .toEqual({ strong: false, em: false, del: false })
  })
})

// ============================================================
// isActive — all branches
// ============================================================

describe('isActive', () => {
  const plain: EditorBlock = { type: 'paragraph', content: [{ type: 'text', text: '' }] }
  const bold: EditorBlock = { type: 'paragraph', content: [{ type: 'strong', text: '' }] }
  const italic: EditorBlock = { type: 'paragraph', content: [{ type: 'em', text: '' }] }
  const strike: EditorBlock = { type: 'paragraph', content: [{ type: 'del', text: '' }] }
  const h1: EditorBlock = { type: 'heading', level: 1, content: [{ type: 'text', text: '' }] }
  const list: EditorBlock = { type: 'bullet_list', items: [] }
  const olist: EditorBlock = { type: 'ordered_list', items: [] }
  const todo: EditorBlock = { type: 'todo_list', items: [] }
  const code: EditorBlock = { type: 'code_block', language: 'ts', code: '' }
  const quote: EditorBlock = { type: 'blockquote', content: [{ type: 'text', text: '' }] }

  it('Bold on bold paragraph', () => { expect(isActive(bold, 'Bold')).toBe(true) })
  it('Bold on plain paragraph', () => { expect(isActive(plain, 'Bold')).toBe(false) })
  it('Italic on italic paragraph', () => { expect(isActive(italic, 'Italic')).toBe(true) })
  it('Italic on plain paragraph', () => { expect(isActive(plain, 'Italic')).toBe(false) })
  it('Strikethrough on strike paragraph', () => { expect(isActive(strike, 'Strikethrough')).toBe(true) })
  it('Strikethrough on plain paragraph', () => { expect(isActive(plain, 'Strikethrough')).toBe(false) })
  it('Text on plain paragraph', () => { expect(isActive(plain, 'Text')).toBe(true) })
  it('Text on bold paragraph', () => { expect(isActive(bold, 'Text')).toBe(false) })
  it('Text on heading', () => { expect(isActive(h1, 'Text')).toBe(false) })
  it('H1 on heading level 1', () => { expect(isActive(h1, 'H1')).toBe(true) })
  it('H1 on heading level 2', () => { expect(isActive({ type: 'heading', level: 2, content: [{ type: 'text', text: '' }] }, 'H1')).toBe(false) })
  it('List on bullet_list', () => { expect(isActive(list, 'List')).toBe(true) })
  it('OrderedList on ordered_list', () => { expect(isActive(olist, 'OrderedList')).toBe(true) })
  it('Todo on todo_list', () => { expect(isActive(todo, 'Todo')).toBe(true) })
  it('Code on code_block', () => { expect(isActive(code, 'Code')).toBe(true) })
  it('Quote on blockquote', () => { expect(isActive(quote, 'Quote')).toBe(true) })
  it('null block returns false', () => { expect(isActive(null, 'Text')).toBe(false) })
})
