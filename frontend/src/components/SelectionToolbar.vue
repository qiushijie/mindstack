<script lang="ts" setup>
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
  PenTool,
} from 'lucide-vue-next'

defineProps<{
  activeLabels: Set<string>
}>()

const emit = defineEmits<{
  select: [label: string]
}>()

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
  {
    items: [
      { icon: PenTool, label: 'AIRewrite' },
    ],
  },
]
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
          :data-testid="`toolbar-${item.label}`"
          :class="{ active: activeLabels.has(item.label) }"
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
  position: relative;
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
  color: var(--foreground-primary);
}

.btn-text {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-sans);
}
</style>
