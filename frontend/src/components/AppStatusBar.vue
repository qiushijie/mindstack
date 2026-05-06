<script lang="ts" setup>
import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorState } from '../composables/useEditorState'
import { useNavigation } from '../composables/useNavigation'
import { useSettings } from '../composables/useSettings'

const { t } = useI18n()
const { editorView } = useEditorState()
const { currentPage } = useNavigation()
const { rawMode } = useSettings()

const line = ref(1)
const col = ref(1)
const words = ref(0)
const chars = ref(0)

function updateCursor() {
  const v = editorView.value
  if (!v) return

  const pos = v.state.selection.main.head
  const lineInfo = v.state.doc.lineAt(pos)
  line.value = lineInfo.number
  col.value = pos - lineInfo.from + 1
}

function updateWordCount() {
  const v = editorView.value
  if (!v) return

  chars.value = v.state.doc.length
  const text = v.state.doc.toString()
  let count = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    const isSpace = ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 12
    if (!isSpace && !inWord) {
      count++
      inWord = true
    } else if (isSpace) {
      inWord = false
    }
  }
  words.value = count
}

function onCursorEvent() {
  updateCursor()
}

function onInputEvent() {
  updateCursor()
  updateWordCount()
}

let currentView: { dom: HTMLElement } | null = null

watch(editorView, (v, oldV) => {
  if (oldV) {
    oldV.dom.removeEventListener('input', onInputEvent)
    oldV.dom.removeEventListener('keyup', onCursorEvent)
    oldV.dom.removeEventListener('click', onCursorEvent)
  }
  currentView = v
  if (v) {
    onInputEvent()
    v.dom.addEventListener('input', onInputEvent)
    v.dom.addEventListener('keyup', onCursorEvent)
    v.dom.addEventListener('click', onCursorEvent)
  }
})

onUnmounted(() => {
  if (currentView) {
    currentView.dom.removeEventListener('input', onInputEvent)
    currentView.dom.removeEventListener('keyup', onCursorEvent)
    currentView.dom.removeEventListener('click', onCursorEvent)
    currentView = null
  }
})
</script>

<template>
  <div class="status-bar">
    <template v-if="currentPage === 'editor'">
      <span class="status-item">{{ rawMode ? 'Raw' : t('statusBar.markdown') }}</span>
      <span class="status-sep">|</span>
      <span class="status-item">{{ t('statusBar.line') }} {{ line }}, {{ t('statusBar.column') }} {{ col }}</span>
      <span class="status-sep">|</span>
      <span class="status-item">{{ words }} {{ t('statusBar.words') }}</span>
      <span class="status-sep">|</span>
      <span class="status-item">{{ chars.toLocaleString() }} {{ t('statusBar.chars') }}</span>
    </template>
    <template v-else-if="currentPage === 'settings'">
      <span class="status-item">{{ t('statusBar.settings') }}</span>
    </template>
    <template v-else-if="currentPage === 'relations'">
      <span class="status-item">{{ t('statusBar.graph') }}</span>
    </template>
    <span class="status-spacer" />
    <span class="status-item">{{ t('statusBar.encoding') }}</span>
  </div>
</template>

<style scoped>
.status-bar {
  height: var(--status-bar-height);
  background-color: var(--surface-secondary);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: 0 var(--spacing-lg);
  user-select: none;
}

.status-item {
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

.status-sep {
  font-size: var(--font-size-xs);
  color: var(--border-strong);
}

.status-spacer {
  flex: 1;
}
</style>
