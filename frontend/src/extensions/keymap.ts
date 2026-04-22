import { keymap, type KeyBinding } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { wrapInline, toggleBlockType, insertLink, toggleCheckbox } from '../utils/markdownUtils'
import { BLOCK_REGISTRY } from '../utils/blockRegistry'

const markdownKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: wrapInline('**', '**') },
  { key: 'Mod-i', run: wrapInline('*', '*') },
  { key: 'Mod-Shift-s', run: wrapInline('~~', '~~') },
  { key: 'Mod-`', run: wrapInline('`', '`') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-0', run: toggleBlockType('') },
  ...BLOCK_REGISTRY
    .filter(c => c.keymap)
    .map(c => ({ key: c.keymap!, run: toggleBlockType(c.prefix) })),
  { key: 'Mod-Enter', run: toggleCheckbox },
]

export function createKeymapExtension(): Extension {
  return keymap.of(markdownKeymap)
}
