<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-vue-next'
import { setSearchQuery, getSearchQuery, findNext, findPrevious, SearchQuery } from '@codemirror/search'
import { useEditorState } from '../composables/useEditorState'

const props = defineProps<{
  visible: boolean
  recalcKey: number
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const { editorView } = useEditorState()
const searchTerm = ref('')
const matchCurrent = ref(0)
const matchTotal = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

function updateMatchInfo() {
  const view = editorView.value
  if (!view) {
    matchCurrent.value = 0
    matchTotal.value = 0
    return
  }

  const query = getSearchQuery(view.state)
  if (!query?.search) {
    matchCurrent.value = 0
    matchTotal.value = 0
    return
  }

  const cursor = view.state.selection.main.head
  const matches: { from: number }[] = []
  const iter = query.getCursor(view.state.doc)
  while (true) {
    const result = iter.next()
    if (result.done) break
    matches.push({ from: result.value.from })
  }

  matchTotal.value = matches.length
  if (matchTotal.value === 0) {
    matchCurrent.value = 0
    return
  }

  let current = 1
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].from <= cursor) current = i + 1
  }
  matchCurrent.value = current
}

// Recalculate when recalcKey changes (fires on CM6 transactions)
watch(() => props.recalcKey, () => {
  if (props.visible) updateMatchInfo()
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  searchTerm.value = value

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const view = editorView.value
    if (!view) return
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: value, caseSensitive: false })),
    })
    requestAnimationFrame(updateMatchInfo)
  }, 80)
}

function goPrev() {
  const view = editorView.value
  if (!view) return
  findPrevious(view)
  nextTick(updateMatchInfo)
}

function goNext() {
  const view = editorView.value
  if (!view) return
  findNext(view)
  nextTick(updateMatchInfo)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    e.preventDefault()
    return
  }
  if (e.key === 'Enter') {
    if (e.shiftKey) goPrev()
    else goNext()
    e.preventDefault()
  }
}

function close() {
  const view = editorView.value
  if (view) {
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: '' })),
    })
    view.focus()
  }
  searchTerm.value = ''
  matchCurrent.value = 0
  matchTotal.value = 0
  emit('close')
}

watch(() => props.visible, (visible) => {
  if (visible) {
    nextTick(() => inputRef.value?.focus())
  }
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div v-if="visible" class="find-panel" @keydown="onKeydown">
    <div class="find-panel-inner">
      <Search :size="16" class="find-icon" />
      <input
        ref="inputRef"
        :value="searchTerm"
        :placeholder="t('editor.find.placeholder')"
        class="find-input"
        @input="onInput"
      />
      <span v-if="matchTotal > 0" class="find-count">{{ matchCurrent }}/{{ matchTotal }}</span>
      <span v-else-if="searchTerm && matchTotal === 0" class="find-count find-count-none">{{ t('editor.find.noResults') }}</span>
      <button class="find-btn" :title="t('editor.find.previous')" @click="goPrev">
        <ChevronUp :size="16" />
      </button>
      <button class="find-btn" :title="t('editor.find.next')" @click="goNext">
        <ChevronDown :size="16" />
      </button>
      <button class="find-btn find-close" :title="t('editor.find.close')" @click="close">
        <X :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.find-panel {
  position: absolute;
  top: 6px;
  right: 80px;
  width: 280px;
  z-index: 50;
  border-radius: 8px;
  background-color: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  --wails-draggable: no-drag;
}

.find-panel-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 12px;
}

.find-icon {
  flex-shrink: 0;
  color: var(--foreground-tertiary);
}

.find-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  outline: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--foreground-primary);
}

.find-input::placeholder {
  color: var(--foreground-tertiary);
}

.find-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--foreground-tertiary);
  font-family: var(--font-sans);
  min-width: 32px;
  text-align: right;
}

.find-count-none {
  color: var(--accent-error, #ef4444);
}

.find-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--foreground-tertiary);
  padding: 0;
  flex-shrink: 0;
}

.find-btn:hover {
  color: var(--foreground-secondary);
  background-color: var(--surface-hover);
}

.find-btn:active {
  transform: scale(0.95);
}
</style>
