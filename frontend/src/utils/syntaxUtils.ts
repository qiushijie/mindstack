import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { BlockType } from './blockType'
import { BLOCK_REGISTRY } from './blockRegistry'

export { BlockType }

export const BLOCK_NODE_NAMES = new Set([
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
  'Paragraph', 'Blockquote', 'FencedCode', 'CodeBlock', 'BulletList', 'OrderedList',
  'ListItem', 'HorizontalRule', 'SetextHeading1', 'SetextHeading2',
])

const nodeToBlockType: Record<string, BlockType> = {
  ATXHeading1: BlockType.H1,
  ATXHeading2: BlockType.H2,
  ATXHeading3: BlockType.H3,
  ATXHeading4: BlockType.H4,
  ATXHeading5: BlockType.H5,
  ATXHeading6: BlockType.H6,
  Blockquote: BlockType.Blockquote,
  FencedCode: BlockType.FencedCode,
  HorizontalRule: BlockType.HorizontalRule,
  Table: BlockType.Table,
  Paragraph: BlockType.Paragraph,
}

export const blockPrefixMap: Record<string, string> = {
  ...Object.fromEntries(BLOCK_REGISTRY.map(c => [c.type, c.prefix])),
  [BlockType.H5]: '##### ',
  [BlockType.H6]: '###### ',
}

const blockTypeToToolbarLabel: Record<string, string> = {
  ...Object.fromEntries(BLOCK_REGISTRY.map(c => [c.type, c.toolbarLabel ?? c.type])),
  [BlockType.H5]: 'H5',
  [BlockType.H6]: 'H6',
  [BlockType.Paragraph]: 'Text',
  [BlockType.HorizontalRule]: 'Text',
  [BlockType.Table]: 'Text',
  [BlockType.MathBlock]: 'Math',
  [BlockType.Unknown]: 'Text',
}

export function blockTypeToLabel(type: BlockType): string | null {
  return blockTypeToToolbarLabel[type] ?? null
}

function resolveBlockType(view: EditorView, pos: number): BlockType | null {
  const tree = syntaxTree(view.state)
  let node = tree.resolveInner(pos, 1)

  // Collect all ancestors
  let current: typeof node | null = node
  const ancestors: { node: typeof node; name: string }[] = []
  while (current) {
    ancestors.push({ node: current, name: current.name })
    current = current.parent
  }

  // Check for ListItem (contains bullet/ordered/todo info) before Paragraph
  for (const { node: n, name } of ancestors) {
    if (name === 'ListItem') {
      const parent = n.parent
      const taskNode = n.getChild('Task')
      const hasTaskMarker = n.getChild('TaskMarker') !== null
        || (taskNode && taskNode.getChild('TaskMarker') !== null)
      if (hasTaskMarker) return BlockType.Todo
      if (parent?.name === 'OrderedList') return BlockType.OrderedList
      return BlockType.BulletList
    }
  }

  // Check for other container types (Blockquote etc.) before Paragraph
  for (const { node: n, name } of ancestors) {
    if (name !== 'Paragraph' && name !== 'Document' && nodeToBlockType[name]) {
      return nodeToBlockType[name]
    }
  }

  // Fall back to Paragraph
  for (const { name } of ancestors) {
    if (nodeToBlockType[name]) return nodeToBlockType[name]
  }

  return null
}

export function getBlockType(view: EditorView, pos: number): BlockType {
  const doc = view.state.doc

  if (pos < 0 || pos > doc.length) return BlockType.Paragraph

  let result = resolveBlockType(view, pos)

  // Fallback: if at end of line / trailing whitespace, try line start
  if (!result) {
    const line = doc.lineAt(pos)
    if (line.from !== pos) {
      result = resolveBlockType(view, line.from)
    }
  }

  const type = result ?? BlockType.Paragraph

  // Detect math block by text pattern (Lezer does not parse $$ syntax)
  if (type === BlockType.Paragraph) {
    const line = doc.lineAt(pos)
    if (line.text.trimStart().startsWith('$$')) {
      return BlockType.MathBlock
    }
  }

  return type
}

export function getBlockTypeAtLine(view: EditorView, line: { from: number; to: number }): BlockType {
  return getBlockType(view, line.from)
}

export function isFullBlockSelection(
  view: EditorView,
  sel: { from: number; to: number },
): boolean {
  const doc = view.state.doc
  const line = doc.lineAt(sel.to)
  const blockType = getBlockTypeAtLine(view, line)
  const prefix = blockPrefixMap[blockType] ?? ''

  // Compute content start by skipping the prefix in the line text
  let contentStart = line.from
  if (prefix) {
    contentStart = line.from + prefix.length
  } else {
    // No known prefix — try to detect mark nodes at line start
    const tree = syntaxTree(view.state)
    const node = tree.resolveInner(line.from, 1)
    let current = node
    while (current) {
      const name = current.name
      if (name === 'HeaderMark' || name === 'QuoteMark' || name === 'ListMark' || name === 'TaskMarker') {
        contentStart = Math.max(contentStart, current.to)
        break
      }
      if (current.firstChild) {
        current = current.firstChild
      } else {
        break
      }
    }
  }

  return sel.from <= contentStart && sel.to >= line.to
}
