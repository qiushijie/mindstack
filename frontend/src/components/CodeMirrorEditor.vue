<script lang="ts" setup>
import { ref, inject, onMounted, onUnmounted, nextTick, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageSquare } from 'lucide-vue-next'
import { syntaxTree } from '@codemirror/language'
import { useCodeMirror } from '../composables/useCodeMirror'
import SelectionToolbar from './SelectionToolbar.vue'
import ImageDialog from './ImageDialog.vue'
import FindPanel from './FindPanel.vue'
import { useSettings } from '../composables/useSettings'
import { setSelectedHeadingLine, currentHeadings } from '../composables/useHeadingTree'
import { BlockType, getBlockTypeAtLine, isFullBlockSelection, blockTypeToLabel } from '../utils/syntaxUtils'
import { getBlockConfigByToolbarLabel } from '../utils/blockRegistry'
import { useFileTree } from '../composables/useFileTree'
import { useEditorState } from '../composables/useEditorState'
import { currentFilePathField } from '../extensions/currentFilePath'
import { getTableCellFromEvent } from '../extensions/tableWidget'
import { parseTable, type TableData } from '../utils/tableUtils'
import { wrapInlineCommand } from '../editor/commands/inline/WrapInlineCommand'
import { insertLinkCommand } from '../editor/commands/inline/InsertLinkCommand'
import { toggleBlockTypeCommand } from '../editor/commands/block/ToggleBlockTypeCommand'
import { insertImageCommand } from '../editor/commands/image/InsertImageCommand'
import { getSelectionRect, constrainRectToViewport } from '../editor/geometry'
import { addRowAboveCommand } from '../editor/commands/table/AddRowAboveCommand'
import { addRowBelowCommand } from '../editor/commands/table/AddRowBelowCommand'
import { deleteRowCommand } from '../editor/commands/table/DeleteRowCommand'
import { addColumnLeftCommand } from '../editor/commands/table/AddColumnLeftCommand'
import { addColumnRightCommand } from '../editor/commands/table/AddColumnRightCommand'
import { deleteColumnCommand } from '../editor/commands/table/DeleteColumnCommand'

const { t } = useI18n()
const { rawMode } = useSettings()
const containerRef = ref<HTMLElement | null>(null)
const imageDialogVisible = ref(false)
let imageInsertLineFrom = -1
const imageEditUrl = ref('')
const imageEditAlt = ref('')
const imageEditFrom = ref<number | undefined>(undefined)
const imageEditTo = ref<number | undefined>(undefined)
const toolbarState = ref({
  visible: false,
  left: 0,
  top: 0,
})
const activeLabels = ref<Set<string>>(new Set())

const { markDirty, selectedFileContent, clearEditorAdapter, setEditorAdapter } = useFileTree()
const { editorAdapter, commandRunner } = useEditorState()

function findNearestHeadingLine(cursorLine: number): number {
  const headings = currentHeadings.value
  let nearest = 1
  for (const h of headings) {
    if (h.line <= cursorLine) {
      nearest = h.line
    } else {
      break
    }
  }
  return nearest
}

const searchVisible = ref(false)
const searchRecalcKey = ref(0)
const showAIChat = inject<Ref<boolean>>('showAIChat', ref(false))

function toggleAIChat() {
  showAIChat.value = !showAIChat.value
}

const { view, focus, setContent } = useCodeMirror({
  container: containerRef,
  rawMode,
  initialDoc: '',
  onChange: (doc) => {
    selectedFileContent.value = doc
    markDirty()
  },
  onSelectionChange: (state) => {
    const pos = state.selection.main.head
    const line = state.doc.lineAt(pos)
    const nearest = findNearestHeadingLine(line.number)
    setSelectedHeadingLine(nearest)
  },
  onScroll: (topLine) => {
    const nearest = findNearestHeadingLine(topLine)
    setSelectedHeadingLine(nearest)
  },
  onSearchToggle: () => { searchVisible.value = !searchVisible.value },
  onTransaction: () => { if (searchVisible.value) searchRecalcKey.value++ },
})

watch(editorAdapter, (adapter) => {
  if (adapter) setEditorAdapter(adapter)
})

function detectActiveLabels(): Set<string> {
  const v = view.value
  if (!v) return new Set()

  const labels = new Set<string>()
  const sel = v.state.selection.main
  const fromLine = v.state.doc.lineAt(sel.from)
  const blockType = getBlockTypeAtLine(v, fromLine)

  // Headings and code always show block type regardless of selection size
  const headingTypes = new Set([BlockType.H1, BlockType.H2, BlockType.H3, BlockType.H4, BlockType.H5, BlockType.H6])
  const isAlwaysBlock = headingTypes.has(blockType) || blockType === BlockType.FencedCode

  if (isAlwaysBlock) {
    const label = blockTypeToLabel(blockType)
    if (label) labels.add(label)
  } else if (isFullBlockSelection(v, sel)) {
    // Full line selected: show block type for list/quote/todo
    if (blockType !== BlockType.Paragraph && blockType !== BlockType.Unknown) {
      const label = blockTypeToLabel(blockType)
      if (label) labels.add(label)
    } else {
      labels.add('Text')
    }
  } else {
    // Partial selection: show inline format
    let hasInline = false
    const tree = syntaxTree(v.state)
    tree.iterate({
      enter(node) {
        // Check if formatting node overlaps with the selection range
        if (node.to <= sel.from || node.from >= sel.to) return
        if (node.name === 'StrongEmphasis' || node.name === 'Strong') {
          labels.add('Bold')
          hasInline = true
        }
        if (node.name === 'Emphasis') {
          if (node.node.parent?.name !== 'StrongEmphasis') {
            labels.add('Italic')
            hasInline = true
          }
        }
        if (node.name === 'Strikethrough') {
          labels.add('Strikethrough')
          hasInline = true
        }
      },
    })
    if (!hasInline) labels.add('Text')
  }

  return labels
}

function showToolbar() {
  const adapter = editorAdapter.value
  const v = view.value
  if (!adapter || !v || rawMode.value) return

  const sel = adapter.getSelection()
  if (sel.anchor === sel.head) {
    toolbarState.value.visible = false
    return
  }

  const rect = getSelectionRect(adapter, sel)
  if (!rect) {
    toolbarState.value.visible = false
    return
  }

  const toolbarWidth = 168
  const toolbarHeight = 168
  const gap = 8

  const desiredLeft = (rect.left + rect.right) / 2 - toolbarWidth / 2
  const spaceBelow = window.innerHeight - rect.bottom
  const desiredTop = spaceBelow >= toolbarHeight + gap
    ? rect.bottom + gap
    : rect.top - toolbarHeight - gap

  const { left, top } = constrainRectToViewport(
    { left: desiredLeft, top: desiredTop, width: toolbarWidth, height: toolbarHeight },
    { left: 8, right: 8, top: 8, bottom: 8 },
  )

  activeLabels.value = detectActiveLabels()
  toolbarState.value = { visible: true, left, top }
}

function handleToolbarSelect(label: string) {
  const runner = commandRunner.value
  if (!runner) return

  toolbarState.value.visible = false

  switch (label) {
    case 'Bold':
      runner.run(wrapInlineCommand, { before: '**', after: '**' })
      break
    case 'Italic':
      runner.run(wrapInlineCommand, { before: '*', after: '*' })
      break
    case 'Strikethrough':
      runner.run(wrapInlineCommand, { before: '~~', after: '~~' })
      break
    case 'Text':
      runner.run(toggleBlockTypeCommand, { prefix: '' })
      break
    case 'Link':
      runner.run(insertLinkCommand, { defaultText: t('editor.placeholder.link') })
      break
    case 'AIRewrite': {
      showAIChat.value = true
      break
    }
    default: {
      const config = getBlockConfigByToolbarLabel(label)
      if (config) runner.run(toggleBlockTypeCommand, { prefix: config.prefix })
      break
    }
  }
}

function handleCmPointerup() {
  nextTick(showToolbar)
}

function handleDocMousedown(e: MouseEvent) {
  const target = e.target instanceof Element ? e.target : null
  if (target && !target.closest('.selection-toolbar') && !target.closest('.context-menu')) {
    toolbarState.value.visible = false
    contextMenuState.value.visible = false
  }
}

function handleDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (contextMenuState.value.visible) {
      contextMenuState.value.visible = false
      e.preventDefault()
      e.stopPropagation()
    } else if (toolbarState.value.visible) {
      toolbarState.value.visible = false
      e.preventDefault()
      e.stopPropagation()
    } else if (searchVisible.value) {
      searchVisible.value = false
      e.preventDefault()
      e.stopPropagation()
    }
  }
}

function handleContextMenu(e: MouseEvent) {
  if (rawMode.value) return
  const target = e.target as HTMLElement
  if (target.closest('.cm-mermaid-preview') || target.closest('.cm-mermaid-edit-header')) {
    return
  }
  e.preventDefault()

  // Check if right-clicking on a table
  tableContext.value = null
  if (view.value) {
    const cellInfo = getTableCellFromEvent(view.value, e)
    if (cellInfo) {
      const tableData = parseTable(view.value, cellInfo.tableFrom, cellInfo.tableTo)
      if (tableData) {
        tableContext.value = { tableData, rowIdx: cellInfo.rowIdx, colIdx: cellInfo.colIdx }
      }
    }
  }

  contextMenuState.value = {
    visible: true,
    left: e.clientX,
    top: e.clientY,
  }

  nextTick(() => {
    const menuEl = document.querySelector('.context-menu') as HTMLElement
    if (!menuEl) return

    const menuWidth = menuEl.offsetWidth
    const menuHeight = menuEl.offsetHeight
    const { left, top } = constrainRectToViewport(
      {
        left: contextMenuState.value.left,
        top: contextMenuState.value.top,
        width: menuWidth,
        height: menuHeight,
      },
      { left: 8, right: 8, top: 8, bottom: 8 },
    )

    contextMenuState.value = { visible: true, left, top }
  })
}

function handleContextAction(action: string) {
  contextMenuState.value.visible = false
  const v = view.value

  switch (action) {
    case 'cut':
      if (v && !v.state.selection.main.empty) {
        const sel = v.state.selection.main
        const text = v.state.sliceDoc(sel.from, sel.to)
        navigator.clipboard.writeText(text)
        v.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } })
      }
      break
    case 'copy':
      if (v && !v.state.selection.main.empty) {
        const sel = v.state.selection.main
        const text = v.state.sliceDoc(sel.from, sel.to)
        navigator.clipboard.writeText(text)
      }
      break
    case 'paste':
      navigator.clipboard.readText().then((text) => {
        const current = view.value
        if (current && text) {
          const sel = current.state.selection.main
          current.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } })
        }
      }).catch((err) => { console.warn('[Editor] Clipboard read failed:', err) })
      break
    case 'refresh':
      location.reload()
      break
    case 'addRowAbove':
      if (tableContext.value) {
        commandRunner.value?.run(addRowAboveCommand, {
          tableData: tableContext.value.tableData,
          rowIdx: tableContext.value.rowIdx,
        })
      }
      break
    case 'addRowBelow':
      if (tableContext.value) {
        commandRunner.value?.run(addRowBelowCommand, {
          tableData: tableContext.value.tableData,
          rowIdx: tableContext.value.rowIdx,
        })
      }
      break
    case 'deleteRow':
      if (tableContext.value) {
        commandRunner.value?.run(deleteRowCommand, {
          tableData: tableContext.value.tableData,
          rowIdx: tableContext.value.rowIdx,
        })
      }
      break
    case 'addColumnLeft':
      if (tableContext.value) {
        commandRunner.value?.run(addColumnLeftCommand, {
          tableData: tableContext.value.tableData,
          rowIdx: tableContext.value.rowIdx,
          colIdx: tableContext.value.colIdx,
        })
      }
      break
    case 'addColumnRight':
      if (tableContext.value) {
        commandRunner.value?.run(addColumnRightCommand, {
          tableData: tableContext.value.tableData,
          rowIdx: tableContext.value.rowIdx,
          colIdx: tableContext.value.colIdx,
        })
      }
      break
    case 'deleteColumn':
      if (tableContext.value) {
        commandRunner.value?.run(deleteColumnCommand, {
          tableData: tableContext.value.tableData,
          rowIdx: tableContext.value.rowIdx,
          colIdx: tableContext.value.colIdx,
        })
      }
      break
  }
  tableContext.value = null
}

const contextMenuState = ref({
  visible: false,
  left: 0,
  top: 0,
})

const tableContext = ref<{
  tableData: TableData
  rowIdx: number
  colIdx: number
} | null>(null)

function handleInsertImage(e: Event) {
  const ce = e as CustomEvent<{ lineFrom: number }>
  imageInsertLineFrom = ce.detail.lineFrom
  imageEditUrl.value = ''
  imageEditAlt.value = ''
  imageEditFrom.value = undefined
  imageEditTo.value = undefined
  imageDialogVisible.value = true
}

function handleEditImage(e: Event) {
  const ce = e as CustomEvent<{ url: string; alt: string; from: number; to: number }>
  imageEditUrl.value = ce.detail.url
  imageEditAlt.value = ce.detail.alt
  imageEditFrom.value = ce.detail.from
  imageEditTo.value = ce.detail.to
  imageDialogVisible.value = true
}

function handleImageConfirm(payload: { url: string; alt: string; editingFrom?: number; editingTo?: number }) {
  imageDialogVisible.value = false
  const alt = payload.alt || t('imageDialog.altPlaceholder')
  commandRunner.value?.run(insertImageCommand, {
    url: payload.url,
    alt,
    lineFrom: imageInsertLineFrom,
    editingFrom: payload.editingFrom,
    editingTo: payload.editingTo,
  })
}

function handleImageDialogClose() {
  imageDialogVisible.value = false
}

onMounted(() => {
  focus()
  document.addEventListener('mousedown', handleDocMousedown)
  document.addEventListener('keydown', handleDocKeydown)
  containerRef.value?.addEventListener('editor:insert-image', handleInsertImage)
  containerRef.value?.addEventListener('editor:edit-image', handleEditImage)
  // Expose toggleFindPanel for E2E tests to open/close find panel without keyboard shortcut
  ;(window as any).__toggleFindPanel = () => { searchVisible.value = !searchVisible.value }
  // Expose showImageDialog for E2E tests to open the image insert dialog
  ;(window as any).__showImageDialog = () => {
    containerRef.value?.dispatchEvent(new CustomEvent('editor:insert-image', { detail: { lineFrom: 0 } }))
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocMousedown)
  document.removeEventListener('keydown', handleDocKeydown)
  containerRef.value?.removeEventListener('editor:insert-image', handleInsertImage)
  containerRef.value?.removeEventListener('editor:edit-image', handleEditImage)
  delete (window as any).__toggleFindPanel
  delete (window as any).__showImageDialog
  clearEditorAdapter()
})
</script>

<template>
  <div class="editor-container" :class="{ 'raw-mode': rawMode }" @contextmenu="handleContextMenu">
    <div ref="containerRef" class="cm-container" @pointerup="handleCmPointerup" />
    <FindPanel
      :visible="searchVisible"
      :recalc-key="searchRecalcKey"
      @close="searchVisible = false"
    />
    <div v-if="!searchVisible" class="floating-actions">
      <button
        class="floating-btn"
        :class="{ active: showAIChat }"
        title="AI Assistant"
        @click="toggleAIChat"
      >
        <MessageSquare :size="18" />
      </button>
    </div>
    <SelectionToolbar
      v-if="toolbarState.visible"
      :active-labels="activeLabels"
      :style="{
        position: 'fixed',
        left: toolbarState.left + 'px',
        top: toolbarState.top + 'px',
        zIndex: 100,
      }"
      @select="handleToolbarSelect"
    />
    <div
      v-if="contextMenuState.visible"
      class="context-menu"
      :style="{
        position: 'fixed',
        left: contextMenuState.left + 'px',
        top: contextMenuState.top + 'px',
        zIndex: 200,
      }"
    >
      <template v-if="tableContext">
        <button class="ctx-item" @click="handleContextAction('addRowAbove')">{{ t('editor.contextMenu.addRowAbove') }}</button>
        <button class="ctx-item" @click="handleContextAction('addRowBelow')">{{ t('editor.contextMenu.addRowBelow') }}</button>
        <button class="ctx-item" @click="handleContextAction('deleteRow')">{{ t('editor.contextMenu.deleteRow') }}</button>
        <div class="ctx-separator" />
        <button class="ctx-item" @click="handleContextAction('addColumnLeft')">{{ t('editor.contextMenu.addColumnLeft') }}</button>
        <button class="ctx-item" @click="handleContextAction('addColumnRight')">{{ t('editor.contextMenu.addColumnRight') }}</button>
        <button class="ctx-item" @click="handleContextAction('deleteColumn')">{{ t('editor.contextMenu.deleteColumn') }}</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="handleContextAction('cut')">{{ t('editor.contextMenu.cut') }}</button>
        <button class="ctx-item" @click="handleContextAction('copy')">{{ t('editor.contextMenu.copy') }}</button>
        <button class="ctx-item" @click="handleContextAction('paste')">{{ t('editor.contextMenu.paste') }}</button>
        <div class="ctx-separator" />
        <button class="ctx-item" @click="handleContextAction('refresh')">{{ t('editor.contextMenu.refresh') }}</button>
      </template>
    </div>
    <ImageDialog
      :visible="imageDialogVisible"
      :initial-url="imageEditUrl"
      :initial-alt="imageEditAlt"
      :editing-from="imageEditFrom"
      :editing-to="imageEditTo"
      :current-file-path="view?.state.field(currentFilePathField, false) ?? ''"
      @close="handleImageDialogClose"
      @confirm="handleImageConfirm"
    />
  </div>
</template>

<style scoped>
.editor-container {
  flex: 1;
  height: 100%;
  display: flex;
  overflow: hidden;
  position: relative;
}

.cm-container {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.cm-container :deep(.cm-editor) {
  height: 100%;
}

.cm-container :deep(.cm-scroller) {
  overflow: auto;
}

.context-menu {
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  min-width: 140px;
}

.ctx-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--foreground-primary);
  text-align: left;
}

.ctx-item:hover {
  background: var(--surface-hover);
}

.ctx-separator {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 0;
}

.floating-actions {
  position: absolute;
  top: 6px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
  --wails-draggable: no-drag;
}

.floating-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  border-radius: 6px;
  padding: 0;
}

.floating-btn:hover {
  color: var(--foreground-secondary);
  background: var(--surface-hover);
}

.floating-btn.active {
  color: var(--accent-primary);
  background: var(--surface-hover);
}

.editor-container.raw-mode :deep(.cm-content) {
  padding-left: 48px;
}
</style>
