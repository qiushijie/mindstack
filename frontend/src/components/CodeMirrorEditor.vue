<script lang="ts" setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { syntaxTree } from '@codemirror/language'
import { useCodeMirror } from '../composables/useCodeMirror'
import SelectionToolbar from './SelectionToolbar.vue'
import ImageDialog from './ImageDialog.vue'
import { wrapInline, toggleBlockType, insertLink } from '../utils/markdownUtils'
import { BlockType, getBlockTypeAtLine, isFullBlockSelection, blockTypeToLabel } from '../utils/syntaxUtils'
import { getBlockConfigByToolbarLabel } from '../utils/blockRegistry'
import { useFileTree } from '../composables/useFileTree'
import { currentFilePathField } from '../extensions/currentFilePath'
import { getTableCellFromEvent } from '../extensions/tableWidget'
import { parseTable, addRowBelow, addRowAbove, deleteRow, addColumnLeft, addColumnRight, deleteColumn, type TableData } from '../utils/tableUtils'

const { t } = useI18n()
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

const { markDirty } = useFileTree()

const { view, focus, setContent } = useCodeMirror({
  container: containerRef,
  initialDoc: '',
  onChange: () => markDirty(),
})

const { setEditorAdapter } = useFileTree()
setEditorAdapter({
  setContent: (content: string) => setContent(content),
  getContent: () => view.value?.state.doc.toString() ?? '',
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
  const v = view.value
  if (!v) return

  const sel = v.state.selection.main
  if (sel.empty) {
    toolbarState.value.visible = false
    return
  }

  const fromCoords = v.coordsAtPos(sel.from)
  const toCoords = v.coordsAtPos(sel.to)
  if (!fromCoords || !toCoords) {
    toolbarState.value.visible = false
    return
  }

  const toolbarWidth = 168
  const toolbarHeight = 168
  const gap = 8
  const left = Math.max(8, Math.min(
    (fromCoords.left + toCoords.right) / 2 - toolbarWidth / 2,
    window.innerWidth - toolbarWidth - 8,
  ))

  const bottom = Math.max(fromCoords.bottom, toCoords.bottom)
  const spaceBelow = window.innerHeight - bottom
  const top = spaceBelow >= toolbarHeight + gap
    ? bottom + gap
    : Math.max(8, fromCoords.top - toolbarHeight - gap)

  activeLabels.value = detectActiveLabels()
  toolbarState.value = { visible: true, left, top }
}

function handleToolbarSelect(label: string) {
  const v = view.value
  if (!v) return

  toolbarState.value.visible = false

  switch (label) {
    case 'Bold': wrapInline('**', '**')(v); break
    case 'Italic': wrapInline('*', '*')(v); break
    case 'Strikethrough': wrapInline('~~', '~~')(v); break
    case 'Text': toggleBlockType('')(v); break
    case 'Link': insertLink(v); break
    default: {
      const config = getBlockConfigByToolbarLabel(label)
      if (config) toggleBlockType(config.prefix)(v)
      break
    }
  }
  v.focus()
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
    }
  }
}

function handleContextMenu(e: MouseEvent) {
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
    let left = contextMenuState.value.left
    let top = contextMenuState.value.top

    // prevent overflow on right
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 8
    }
    // prevent overflow on bottom
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 8
    }
    // prevent overflow on left and top
    if (left < 8) left = 8
    if (top < 8) top = 8

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
      }).catch(() => {})
      break
    case 'refresh':
      location.reload()
      break
    case 'addRowAbove':
      if (v && tableContext.value) {
        addRowAbove(v, tableContext.value.tableData, tableContext.value.rowIdx)
      }
      break
    case 'addRowBelow':
      if (v && tableContext.value) {
        addRowBelow(v, tableContext.value.tableData, tableContext.value.rowIdx)
      }
      break
    case 'deleteRow':
      if (v && tableContext.value) {
        deleteRow(v, tableContext.value.tableData, tableContext.value.rowIdx)
      }
      break
    case 'addColumnLeft':
      if (v && tableContext.value) {
        addColumnLeft(v, tableContext.value.tableData, tableContext.value.rowIdx, tableContext.value.colIdx)
      }
      break
    case 'addColumnRight':
      if (v && tableContext.value) {
        addColumnRight(v, tableContext.value.tableData, tableContext.value.rowIdx, tableContext.value.colIdx)
      }
      break
    case 'deleteColumn':
      if (v && tableContext.value) {
        deleteColumn(v, tableContext.value.tableData, tableContext.value.rowIdx, tableContext.value.colIdx)
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
  const v = view.value
  if (!v) return

  const alt = payload.alt || t('imageDialog.altPlaceholder')

  if (payload.editingFrom != null && payload.editingTo != null) {
    // Edit mode: replace existing image markdown
    const newText = `![${alt}](${payload.url})`
    v.dispatch({
      changes: { from: payload.editingFrom, to: payload.editingTo, insert: newText },
      selection: { anchor: payload.editingFrom + newText.length },
    })
  } else {
    // Insert mode: add new image after the line
    const doc = v.state.doc
    const line = doc.lineAt(imageInsertLineFrom)
    const insertText = `\n\n![${alt}](${payload.url})`
    v.dispatch({
      changes: { from: line.to, to: line.to, insert: insertText },
      selection: { anchor: line.to + insertText.length },
    })
  }
  v.focus()
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
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocMousedown)
  document.removeEventListener('keydown', handleDocKeydown)
  containerRef.value?.removeEventListener('editor:insert-image', handleInsertImage)
  containerRef.value?.removeEventListener('editor:edit-image', handleEditImage)
})
</script>

<template>
  <div class="editor-container" @contextmenu="handleContextMenu">
    <div ref="containerRef" class="cm-container" @pointerup="handleCmPointerup" />
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
</style>
