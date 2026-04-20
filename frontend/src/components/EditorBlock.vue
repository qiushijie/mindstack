<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Plus, GripVertical } from 'lucide-vue-next'
import BlockContextMenu from './BlockContextMenu.vue'

const props = defineProps<{
  isDragSource?: boolean
  blockIndex?: number
}>()

const emit = defineEmits<{
  'add-block': [label: string]
  'drag-start': [event: PointerEvent]
  'block-ref': [element: HTMLElement]
}>()

const menuVisible = ref(false)

function toggleMenu(event: MouseEvent) {
  event.stopPropagation()
  menuVisible.value = !menuVisible.value
}

function closeMenu() {
  menuVisible.value = false
}

function handleSelect(label: string) {
  closeMenu()
  emit('add-block', label)
}

function handleClickOutside(e: MouseEvent) {
  if (!menuVisible.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.context-menu') && !target.closest('.plus-btn')) {
    closeMenu()
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div
    class="editor-block"
    :data-block-index="props.blockIndex"
    :class="{ 'is-dragging': props.isDragSource }"
    :ref="(el: any) => { if (el) emit('block-ref', el as HTMLElement) }"
  >
    <div class="block-controls">
      <button class="block-btn plus-btn" @click="toggleMenu">
        <Plus :size="20" />
      </button>
      <button
        class="block-btn drag-btn"
        @pointerdown.prevent="(e) => emit('drag-start', e as PointerEvent)"
      >
        <GripVertical :size="16" />
      </button>
    </div>
    <slot />
    <BlockContextMenu
      v-if="menuVisible"
      class="context-menu"
      @close="closeMenu"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.editor-block {
  position: relative;
}

.block-controls {
  position: absolute;
  left: -52px;
  top: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.editor-block:hover .block-controls {
  opacity: 1;
}

.block-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--foreground-tertiary);
  padding: 0;
}

.block-btn:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}

.editor-block.is-dragging {
  opacity: 0.4;
  pointer-events: none;
}

.drag-btn {
  cursor: grab;
}

.context-menu {
  position: absolute;
  left: -52px;
  top: 28px;
  z-index: 100;
}
</style>
