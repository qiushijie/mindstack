import type { EditorBlock, InlineContent, InlineType } from '../types/editor'

export function extractText(block: EditorBlock): string {
  if ('content' in block) {
    return block.content.map(c => c.text).join('')
  }
  if ('items' in block) {
    return block.items
      .map(item => item.content.map(c => c.text).join(''))
      .join('\n')
  }
  if ('code' in block) {
    return block.code
  }
  return ''
}

export function getInlineType(label: string): InlineType | null {
  switch (label) {
    case 'Bold': return 'strong'
    case 'Italic': return 'em'
    case 'Strikethrough': return 'del'
    default: return null
  }
}

export function transformBlock(block: EditorBlock, label: string): EditorBlock | null {
  const text = extractText(block)
  const content: InlineContent[] = [{ type: 'text', text }]

  switch (label) {
    case 'H1':
      return { type: 'heading', level: 1, content }
    case 'H2':
      return { type: 'heading', level: 2, content }
    case 'H3':
      return { type: 'heading', level: 3, content }
    case 'H4':
      return { type: 'heading', level: 4, content }
    case 'Text':
      return { type: 'paragraph', content }
    case 'List':
      return { type: 'bullet_list', items: [{ content }] }
    case 'OrderedList':
      return { type: 'ordered_list', items: [{ content }] }
    case 'Todo':
      return { type: 'todo_list', items: [{ checked: false, content }] }
    case 'Code':
      return { type: 'code_block', language: 'text', code: text }
    case 'Quote':
      return { type: 'blockquote', content }
    default:
      break
  }

  const inlineType = getInlineType(label)
  if (inlineType && 'content' in block) {
    const hasInline = block.content.some(c => c.type === inlineType)
    if (hasInline) {
      // Toggle off: remove target inline type from all elements
      return {
        ...block,
        content: block.content.map(c =>
          c.type === inlineType ? { type: 'text' as const, text: c.text } : c
        ),
      } as EditorBlock
    }
    // Apply inline: convert plain text elements to target type
    return {
      ...block,
      content: block.content.map(c =>
        c.type === 'text' ? { type: inlineType, text: c.text } : c
      ),
    } as EditorBlock
  }

  return null
}

export function getActiveLabel(block: EditorBlock | null): string | null {
  if (!block) return null
  switch (block.type) {
    case 'heading': return 'H' + block.level
    case 'paragraph': return 'Text'
    case 'bullet_list': return 'List'
    case 'ordered_list': return 'OrderedList'
    case 'todo_list': return 'Todo'
    case 'code_block': return 'Code'
    case 'blockquote': return 'Quote'
    default: return null
  }
}

export function getInlineActive(block: EditorBlock | null): { strong: boolean; em: boolean; del: boolean } {
  if (!block || !('content' in block)) return { strong: false, em: false, del: false }
  return {
    strong: block.content.some(c => c.type === 'strong'),
    em: block.content.some(c => c.type === 'em'),
    del: block.content.some(c => c.type === 'del'),
  }
}

export function isActive(block: EditorBlock | null, label: string): boolean {
  const inline = getInlineActive(block)
  if (label === 'Bold') return inline.strong
  if (label === 'Italic') return inline.em
  if (label === 'Strikethrough') return inline.del
  if (label === 'Text') {
    if (getActiveLabel(block) !== 'Text') return false
    return !inline.strong && !inline.em && !inline.del
  }
  return getActiveLabel(block) === label
}
