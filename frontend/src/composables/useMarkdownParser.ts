import { ref, watch, isRef, unref, type Ref } from 'vue'
import MarkdownIt from 'markdown-it'
import taskListsPlugin from 'markdown-it-task-lists'
import type { EditorBlock, InlineContent, ListItem, TodoItem } from '../types/editor'

export function useMarkdownParser(markdownSource: Ref<string> | string) {
  const blocks = ref<EditorBlock[]>([])

  const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
    .use(taskListsPlugin)

  function parse() {
    const source = unref(markdownSource)
    const tokens = md.parse(source, {})
    blocks.value = tokensToBlocks(tokens)
  }

  if (isRef(markdownSource)) {
    watch(markdownSource, parse, { immediate: true })
  } else {
    parse()
  }

  return { blocks, parse }
}

function tokensToBlocks(tokens: MarkdownIt.Token[]): EditorBlock[] {
  const result: EditorBlock[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    if (token.type === 'heading_open') {
      const level = parseInt(token.tag.slice(1)) as 1 | 2 | 3
      const content = tokensToInline(tokens, i + 1, findClose(tokens, i, 'heading_close'))
      result.push({ type: 'heading', level, content })
      i = findClose(tokens, i, 'heading_close') + 1
      continue
    }

    if (token.type === 'paragraph_open') {
      const content = tokensToInline(tokens, i + 1, findClose(tokens, i, 'paragraph_close'))
      result.push({ type: 'paragraph', content })
      i = findClose(tokens, i, 'paragraph_close') + 1
      continue
    }

    if (token.type === 'bullet_list_open') {
      const closeIdx = findClose(tokens, i, 'bullet_list_close')
      const items = parseListItems(tokens, i + 1, closeIdx)
      const hasCheckbox = items.some(item => 'checked' in item)

      if (hasCheckbox) {
        result.push({
          type: 'todo_list',
          items: items as TodoItem[],
        })
      } else {
        result.push({
          type: 'bullet_list',
          items: items as ListItem[],
        })
      }
      i = closeIdx + 1
      continue
    }

    if (token.type === 'ordered_list_open') {
      const closeIdx = findClose(tokens, i, 'ordered_list_close')
      const items = parseListItems(tokens, i + 1, closeIdx)
      result.push({
        type: 'ordered_list',
        items: items as ListItem[],
      })
      i = closeIdx + 1
      continue
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      result.push({
        type: 'code_block',
        language: token.info.trim() || 'text',
        code: token.content.replace(/\n$/, ''),
      })
      i++
      continue
    }

    if (token.type === 'blockquote_open') {
      const closeIdx = findClose(tokens, i, 'blockquote_close')
      const content = extractBlockquoteInline(tokens, i + 1, closeIdx)
      result.push({ type: 'blockquote', content })
      i = closeIdx + 1
      continue
    }

    i++
  }

  return result
}

function findClose(tokens: MarkdownIt.Token[], openIdx: number, closeType: string): number {
  for (let j = openIdx + 1; j < tokens.length; j++) {
    if (tokens[j].type === closeType) return j
  }
  return tokens.length - 1
}

function tokensToInline(tokens: MarkdownIt.Token[], start: number, end: number): InlineContent[] {
  const result: InlineContent[] = []
  let i = start

  while (i < end) {
    const token = tokens[i]

    if (token.type === 'text') {
      result.push({ type: 'text', text: token.content })
      i++
      continue
    }

    if (token.type === 'code_inline') {
      result.push({ type: 'code_inline', text: token.content })
      i++
      continue
    }

    if (token.type === 'softbreak') {
      result.push({ type: 'text', text: ' ' })
      i++
      continue
    }

    if (token.type === 'hardbreak') {
      result.push({ type: 'text', text: '\n' })
      i++
      continue
    }

    const inlinePairs: Record<string, InlineType> = {
      strong_open: 'strong',
      em_open: 'em',
      del_open: 'del',
    }

    const inlineType = inlinePairs[token.type]
    if (inlineType) {
      const closeType = token.type.replace('_open', '_close')
      const closeIdx = findClose(tokens, i, closeType)
      const text = extractTextContent(tokens, i + 1, closeIdx)
      result.push({ type: inlineType, text })
      i = closeIdx + 1
      continue
    }

    if (token.type === 'link_open') {
      const href = token.attrGet('href') || ''
      const closeIdx = findClose(tokens, i, 'link_close')
      const text = extractTextContent(tokens, i + 1, closeIdx)
      result.push({ type: 'link', text, href })
      i = closeIdx + 1
      continue
    }

    i++
  }

  return result
}

function extractTextContent(tokens: MarkdownIt.Token[], start: number, end: number): string {
  let text = ''
  for (let i = start; i < end; i++) {
    if (tokens[i].content) {
      text += tokens[i].content
    }
  }
  return text
}

function parseListItems(tokens: MarkdownIt.Token[], start: number, end: number): (ListItem | TodoItem)[] {
  const items: (ListItem | TodoItem)[] = []
  let i = start

  while (i < end) {
    if (tokens[i].type === 'list_item_open') {
      const itemClose = findClose(tokens, i, 'list_item_close')
      const innerTokens = tokens.slice(i + 1, itemClose)

      const checkboxToken = innerTokens.find(t => t.type === 'checkbox')
      if (checkboxToken) {
        const checked = checkboxToken.attrGet('checked') !== null
        const contentStart = innerTokens.findIndex(t => t.type === 'paragraph_open')
        const contentEnd = innerTokens.findIndex(t => t.type === 'paragraph_close')
        const content = contentStart >= 0 && contentEnd >= 0
          ? tokensToInline(innerTokens, contentStart + 1, contentEnd)
          : []
        items.push({ checked, content })
      } else {
        const paraOpen = innerTokens.findIndex(t => t.type === 'paragraph_open')
        const paraClose = innerTokens.findIndex(t => t.type === 'paragraph_close')
        if (paraOpen >= 0 && paraClose >= 0) {
          const content = tokensToInline(innerTokens, paraOpen + 1, paraClose)
          items.push({ content })
        } else {
          items.push({ content: [] })
        }
      }

      i = itemClose + 1
      continue
    }
    i++
  }

  return items
}

function extractBlockquoteInline(tokens: MarkdownIt.Token[], start: number, end: number): InlineContent[] {
  for (let i = start; i < end; i++) {
    if (tokens[i].type === 'paragraph_open') {
      const paraClose = findClose(tokens, i, 'paragraph_close')
      return tokensToInline(tokens, i + 1, paraClose)
    }
  }
  return []
}
