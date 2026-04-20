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
  Image,
  Table,
} from 'lucide-vue-next'

const emit = defineEmits<{
  close: []
  select: [label: string]
}>()

interface MenuItem {
  icon?: any
  label: string
  shortcut?: string
  fontWeight?: number
}

const groups: { items: MenuItem[] }[] = [
  {
    items: [
      { icon: Bold, label: 'Bold', shortcut: '⌘B' },
      { icon: Italic, label: 'Italic', shortcut: '⌘I' },
      { icon: Strikethrough, label: 'Strikethrough' },
    ],
  },
  {
    items: [
      { label: 'Heading 1', shortcut: '# ', fontWeight: 600 },
      { label: 'Heading 2', shortcut: '## ', fontWeight: 600 },
      { label: 'Heading 3', shortcut: '### ', fontWeight: 600 },
    ],
  },
  {
    items: [
      { icon: List, label: 'Bullet List' },
      { icon: ListOrdered, label: 'Numbered List' },
      { icon: SquareCheck, label: 'To-do List' },
    ],
  },
  {
    items: [
      { icon: Code, label: 'Code Block' },
      { icon: Quote, label: 'Blockquote' },
      { icon: Link, label: 'Link' },
      { icon: Image, label: 'Image' },
      { icon: Table, label: 'Table' },
    ],
  },
]
</script>

<template>
  <div class="context-menu" @click.stop>
    <template v-for="(group, gi) in groups" :key="gi">
      <div v-if="gi > 0" class="menu-sep" />
      <button
        v-for="item in group.items"
        :key="item.label"
        class="menu-item"
        @click="emit('select', item.label)"
      >
        <component
          v-if="item.icon"
          :is="item.icon"
          :size="16"
          class="menu-icon"
        />
        <span
          class="menu-label"
          :style="{ fontWeight: item.fontWeight || 400 }"
        >{{ item.label }}</span>
        <span v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.context-menu {
  width: 280px;
  background-color: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.menu-sep {
  height: 1px;
  background-color: var(--border-subtle);
  margin: 4px 0;
}

.menu-item {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--foreground-primary);
}

.menu-item:hover {
  background-color: var(--surface-hover);
}

.menu-icon {
  flex-shrink: 0;
  color: var(--foreground-secondary);
}

.menu-label {
  flex: 1;
  text-align: left;
}

.menu-shortcut {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--foreground-tertiary);
}
</style>
