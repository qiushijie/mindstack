import { keymap, type KeyBinding, type EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { BLOCK_REGISTRY } from '../utils/blockRegistry'
import { t } from '../i18n'
import { createCommandRunner } from '../editor/commands/createCommandRunner'
import { wrapInlineCommand } from '../editor/commands/inline/WrapInlineCommand'
import { insertLinkCommand } from '../editor/commands/inline/InsertLinkCommand'
import { toggleBlockTypeCommand } from '../editor/commands/block/ToggleBlockTypeCommand'
import { toggleCheckboxCommand } from '../editor/commands/block/ToggleCheckboxCommand'

function runWrapInline(before: string, after: string) {
  return (view: EditorView): boolean => {
    const runner = createCommandRunner(view)
    return runner.run(wrapInlineCommand, { before, after }).success
  }
}

function runToggleBlockType(prefix: string) {
  return (view: EditorView): boolean => {
    const runner = createCommandRunner(view)
    return runner.run(toggleBlockTypeCommand, { prefix }).success
  }
}

function runInsertLink(view: EditorView): boolean {
  const runner = createCommandRunner(view)
  return runner.run(insertLinkCommand, { defaultText: t('editor.placeholder.link') }).success
}

function runToggleCheckbox(view: EditorView): boolean {
  const runner = createCommandRunner(view)
  return runner.run(toggleCheckboxCommand).success
}

const markdownKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: runWrapInline('**', '**') },
  { key: 'Mod-i', run: runWrapInline('*', '*') },
  { key: 'Mod-Shift-s', run: runWrapInline('~~', '~~') },
  { key: 'Mod-`', run: runWrapInline('`', '`') },
  { key: 'Mod-k', run: runInsertLink },
  { key: 'Mod-0', run: runToggleBlockType('') },
  ...BLOCK_REGISTRY
    .filter(c => c.keymap)
    .map(c => ({ key: c.keymap!, run: runToggleBlockType(c.prefix) })),
  { key: 'Mod-Enter', run: runToggleCheckbox },
]

export function createKeymapExtension(): Extension {
  return keymap.of(markdownKeymap)
}
