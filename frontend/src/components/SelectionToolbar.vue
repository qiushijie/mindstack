<script lang="ts" setup>
import { computed } from 'vue'
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  SquareCheck,
  Code,
  Quote,
  Link,
} from 'lucide-vue-next'
import type { EditorBlock } from '../types/editor'

const props = defineProps<{
  block: EditorBlock | null
}>()

const emit = defineEmits<{
  select: [label: string]
}>()

const activeLabel = computed(() => {
  const b = props.block
  if (!b) return null
  switch (b.type) {
    case 'heading':
      return 'H' + b.level
    case 'paragraph':
      return 'Text'
    case 'bullet_list':
      return 'List'
    case 'ordered_list':
      return 'OrderedList'
    case 'todo_list':
      return 'Todo'
    case 'code_block':
      return 'Code'
    case 'blockquote':
      return 'Quote'
    default:
      return null
  }
})

const inlineActive = computed(() => {
  const b = props.block
  if (!b || !('content' in b)) return { strong: false, em: false, del: false }
  return {
    strong: b.content.some(c => c.type === 'strong'),
    em: b.content.some(c => c.type === 'em'),
    del: b.content.some(c => c.type === 'del'),
  }
})

interface ToolbarItem {
  icon?: any
  text?: string
  label: string
}

const rows: { items: ToolbarItem[] }[] = [
  {
    items: [
      { icon: Bold, label: 'Bold' },
      { icon: Italic, label: 'Italic' },
      { icon: Strikethrough, label: 'Strikethrough' },
      { text: 'T', label: 'Text' },
    ],
  },
  {
    items: [
      { text: 'H1', label: 'H1' },
      { text: 'H2', label: 'H2' },
      { text: 'H3', label: 'H3' },
      { text: 'H4', label: 'H4' },
    ],
  },
  {
    items: [
      { icon: List, label: 'List' },
      { icon: ListOrdered, label: 'OrderedList' },
      { icon: SquareCheck, label: 'Todo' },
    ],
  },
  {
    items: [
      { icon: Code, label: 'Code' },
      { icon: Quote, label: 'Quote' },
      { icon: Link, label: 'Link' },
    ],
  },
]

function isActive(label: string): boolean {
  if (label === 'Bold') return inlineActive.value.strong
  if (label === 'Italic') return inlineActive.value.em
  if (label === 'Strikethrough') return inlineActive.value.del
  if (label === 'Text') {
    if (activeLabel.value !== 'Text') return false
    return !inlineActive.value.strong && !inlineActive.value.em && !inlineActive.value.del
  }
  return activeLabel.value === label
}
</script>

<template>
  <div class="selection-toolbar">
    <template v-for="(row, ri) in rows" :key="ri">
      <div v-if="ri > 0" class="toolbar-sep" />
      <div class="toolbar-row">
        <button
          v-for="item in row.items"
          :key="item.label"
          class="toolbar-btn"
          :class="{ active: isActive(item.label) }"
          @pointerdown.prevent="emit('select', item.label)"
          @keydown.enter.prevent="emit('select', item.label)"
          @keydown.space.prevent="emit('select', item.label)"
        >
          <component v-if="item.icon" :is="item.icon" :size="16" />
          <span v-else class="btn-text">{{ item.text }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.selection-toolbar {
  background-color: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.toolbar-sep {
  height: 1px;
  background-color: var(--border-subtle);
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0 4px;
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--foreground-secondary);
}

.toolbar-btn:hover {
  background-color: var(--surface-hover);
}

.toolbar-btn:active {
  background-color: var(--surface-active);
  transform: scale(0.95);
}

.toolbar-btn.active {
  background-color: var(--surface-active);
}

.btn-text {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-sans);
}
</style>
