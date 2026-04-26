import { BlockType, type BlockType as BlockTypeT } from './blockType'

export interface BlockConfig {
  type: BlockTypeT
  label: string
  description: string
  prefix: string
  example: string
  toolbarLabel?: string
  keymap?: string
  key: string
}

export const BLOCK_REGISTRY: BlockConfig[] = [
  { key: 'h1', type: BlockType.H1, label: 'Heading 1', description: 'Large heading', prefix: '# ', example: 'Heading 1', toolbarLabel: 'H1', keymap: 'Mod-1' },
  { key: 'h2', type: BlockType.H2, label: 'Heading 2', description: 'Medium heading', prefix: '## ', example: 'Heading 2', toolbarLabel: 'H2', keymap: 'Mod-2' },
  { key: 'h3', type: BlockType.H3, label: 'Heading 3', description: 'Small heading', prefix: '### ', example: 'Heading 3', toolbarLabel: 'H3', keymap: 'Mod-3' },
  { key: 'h4', type: BlockType.H4, label: 'Heading 4', description: 'Smaller heading', prefix: '#### ', example: 'Heading 4', toolbarLabel: 'H4', keymap: 'Mod-4' },
  { key: 'bulletList', type: BlockType.BulletList, label: 'Bullet List', description: 'Unordered list', prefix: '- ', example: 'List item', toolbarLabel: 'List', keymap: 'Mod-Shift-8' },
  { key: 'orderedList', type: BlockType.OrderedList, label: 'Numbered List', description: 'Ordered list', prefix: '1. ', example: 'List item', toolbarLabel: 'OrderedList', keymap: 'Mod-Shift-9' },
  { key: 'todo', type: BlockType.Todo, label: 'To-do', description: 'Task list', prefix: '- [ ] ', example: 'To-do', toolbarLabel: 'Todo' },
  { key: 'blockquote', type: BlockType.Blockquote, label: 'Blockquote', description: 'Quote block', prefix: '> ', example: 'Quote', toolbarLabel: 'Quote', keymap: 'Mod-Shift-.' },
  { key: 'codeBlock', type: BlockType.FencedCode, label: 'Code Block', description: 'Code snippet', prefix: '```text\n', example: 'code here\n```', toolbarLabel: 'Code', keymap: 'Mod-Alt-C' },
]

const byType = new Map<BlockTypeT, BlockConfig>(BLOCK_REGISTRY.map(c => [c.type, c]))
const byToolbarLabel = new Map<string, BlockConfig>(
  BLOCK_REGISTRY.filter(c => c.toolbarLabel).map(c => [c.toolbarLabel!, c]),
)
const byPrefix = new Map<string, BlockConfig>(BLOCK_REGISTRY.map(c => [c.prefix, c]))

export function getBlockConfig(type: BlockTypeT): BlockConfig | undefined {
  return byType.get(type)
}

export function getBlockConfigByToolbarLabel(label: string): BlockConfig | undefined {
  return byToolbarLabel.get(label)
}

export function getBlockConfigByPrefix(prefix: string): BlockConfig | undefined {
  return byPrefix.get(prefix)
}
