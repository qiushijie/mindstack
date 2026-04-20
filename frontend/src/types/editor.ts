export type InlineType = 'text' | 'strong' | 'em' | 'del' | 'code_inline' | 'link'

export interface InlineContent {
  type: InlineType
  text: string
  href?: string
}

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'ordered_list'
  | 'bullet_list'
  | 'todo_list'
  | 'code_block'
  | 'blockquote'

export interface HeadingBlock {
  type: 'heading'
  level: 1 | 2 | 3 | 4
  content: InlineContent[]
}

export interface ParagraphBlock {
  type: 'paragraph'
  content: InlineContent[]
}

export interface ListItem {
  content: InlineContent[]
}

export interface OrderedListBlock {
  type: 'ordered_list'
  items: ListItem[]
}

export interface BulletListBlock {
  type: 'bullet_list'
  items: ListItem[]
}

export interface TodoItem {
  checked: boolean
  content: InlineContent[]
}

export interface TodoListBlock {
  type: 'todo_list'
  items: TodoItem[]
}

export interface CodeBlockData {
  type: 'code_block'
  language: string
  code: string
}

export interface BlockquoteBlock {
  type: 'blockquote'
  content: InlineContent[]
}

export type EditorBlock =
  | HeadingBlock
  | ParagraphBlock
  | OrderedListBlock
  | BulletListBlock
  | TodoListBlock
  | CodeBlockData
  | BlockquoteBlock
