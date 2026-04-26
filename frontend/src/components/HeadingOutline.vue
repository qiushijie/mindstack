<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { HeadingNode } from '../composables/useHeadingTree'

const { t } = useI18n()

const props = defineProps<{
  headings: HeadingNode[]
  selectedLine?: number
}>()

const emit = defineEmits<{
  select: [line: number]
}>()

function getIndent(level: number): number {
  return 8 + (level - 1) * 16
}

function getFontSize(level: number): number {
  if (level === 1) return 14
  if (level === 2) return 13
  return 12
}

function getFontWeight(level: number): string {
  if (level === 1) return '600'
  if (level === 2) return '500'
  return 'normal'
}
</script>

<template>
  <div class="heading-outline">
    <div
      v-for="heading in headings"
      :key="heading.line"
      class="heading-item"
      :class="{ active: heading.line === selectedLine }"
      :style="{
        paddingLeft: getIndent(heading.level) + 'px',
        fontSize: getFontSize(heading.level) + 'px',
        fontWeight: getFontWeight(heading.level),
      }"
      @click="emit('select', heading.line)"
    >
      <span class="heading-text">{{ heading.text }}</span>
    </div>
    <div v-if="headings.length === 0" class="heading-empty">
      <span class="empty-text">{{ t('sidebar.noHeadings') }}</span>
    </div>
  </div>
</template>

<style scoped>
.heading-outline {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.heading-item {
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding-right: 8px;
  cursor: pointer;
  color: var(--foreground-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.heading-item:hover {
  background-color: var(--surface-hover);
}

.heading-item.active {
  background-color: var(--accent-primary);
  color: var(--foreground-inverse);
}

.heading-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.heading-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-text {
  font-size: 13px;
  color: var(--foreground-tertiary);
}
</style>
