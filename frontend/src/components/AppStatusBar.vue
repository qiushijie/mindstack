<script lang="ts" setup>
import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorState } from '../composables/useEditorState'
import { useNavigation } from '../composables/useNavigation'
import { useSettings } from '../composables/useSettings'

interface Props {
  gitStatus?: { status: string; error: string }
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editorAdapter } = useEditorState()
const { currentPage } = useNavigation()
const { rawMode } = useSettings()

const line = ref(1)
const col = ref(1)
const words = ref(0)
const chars = ref(0)

function updateCursor() {
  const adapter = editorAdapter.value
  if (!adapter) return

  const pos = adapter.getCursorPosition()
  line.value = pos.line
  col.value = pos.column
}

function updateWordCount() {
  const adapter = editorAdapter.value
  if (!adapter) return

  const stats = adapter.getStats()
  chars.value = stats.chars
  words.value = stats.words
}

function onCursorEvent() {
  updateCursor()
}

function onInputEvent() {
  updateCursor()
  updateWordCount()
}

let currentDom: HTMLElement | null = null

watch(editorAdapter, (adapter, oldAdapter) => {
  if (oldAdapter) {
    const dom = oldAdapter.getDOM()
    if (dom) {
      dom.removeEventListener('input', onInputEvent)
      dom.removeEventListener('keyup', onCursorEvent)
      dom.removeEventListener('click', onCursorEvent)
    }
  }
  const dom = adapter?.getDOM() ?? null
  currentDom = dom
  if (dom) {
    onInputEvent()
    dom.addEventListener('input', onInputEvent)
    dom.addEventListener('keyup', onCursorEvent)
    dom.addEventListener('click', onCursorEvent)
  }
})

onUnmounted(() => {
  if (currentDom) {
    currentDom.removeEventListener('input', onInputEvent)
    currentDom.removeEventListener('keyup', onCursorEvent)
    currentDom.removeEventListener('click', onCursorEvent)
    currentDom = null
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
    <template v-if="props.gitStatus?.status || props.gitStatus?.error">
      <span
        class="status-item"
        data-testid="git-status"
        :class="{ error: !!props.gitStatus.error }"
      >{{ props.gitStatus.error || props.gitStatus.status }}</span>
      <span class="status-sep">|</span>
    </template>
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
.status-item.error {
  color: var(--danger-primary);
}

</style>
