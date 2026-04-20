<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Copy } from 'lucide-vue-next'
import EditorBlock from './EditorBlock.vue'
import SelectionToolbar from './SelectionToolbar.vue'
import InlineContent from './InlineContent.vue'
import { useMarkdownParser } from '../composables/useMarkdownParser'
import { useBlockDrag } from '../composables/useBlockDrag'
import { sampleMarkdown } from '../data/sampleMarkdown'
import { transformBlock } from '../utils/blockTransform'
import type { EditorBlock as EditorBlockType } from '../types/editor'

let disposed = false
const scrollRef = ref<HTMLElement | null>(null)
const toolbarState = ref({
  visible: false,
  left: 0,
  top: 0,
  blockIndex: -1,
})

const { blocks } = useMarkdownParser(sampleMarkdown)
const { dragState, registerBlockRef, startDrag, cleanup: cleanupDrag } = useBlockDrag(blocks)

function handleDragStart(index: number, event: PointerEvent) {
  startDrag(index, event)
}

function handleBlockRef(index: number, el: HTMLElement) {
  registerBlockRef(index, el)
}

function spacerClass(block: EditorBlockType, prevBlock: EditorBlockType | null): string {
  if (!prevBlock) return ''
  if (prevBlock.type === 'heading') return 'editor-spacer-sm'
  if (block.type === 'heading') return 'editor-spacer-md'
  return 'editor-spacer-lg'
}

function handleAddBlock(index: number, label: string) {
  const block = createBlock(label)
  if (block) {
    blocks.value.splice(index + 1, 0, block)
  }
}

function createBlock(label: string): EditorBlockType | null {
  switch (label) {
    case 'Heading 1':
      return { type: 'heading', level: 1, content: [{ type: 'text', text: 'Heading' }] }
    case 'Heading 2':
      return { type: 'heading', level: 2, content: [{ type: 'text', text: 'Heading' }] }
    case 'Heading 3':
      return { type: 'heading', level: 3, content: [{ type: 'text', text: 'Heading' }] }
    case 'Bold':
      return { type: 'paragraph', content: [{ type: 'strong', text: 'Bold text' }] }
    case 'Italic':
      return { type: 'paragraph', content: [{ type: 'em', text: 'Italic text' }] }
    case 'Strikethrough':
      return { type: 'paragraph', content: [{ type: 'del', text: 'Strikethrough text' }] }
    case 'Bullet List':
      return { type: 'bullet_list', items: [{ content: [{ type: 'text', text: 'List item' }] }] }
    case 'Numbered List':
      return { type: 'ordered_list', items: [{ content: [{ type: 'text', text: 'List item' }] }] }
    case 'To-do List':
      return { type: 'todo_list', items: [{ checked: false, content: [{ type: 'text', text: 'To-do' }] }] }
    case 'Code Block':
      return { type: 'code_block', language: 'text', code: '' }
    case 'Blockquote':
      return { type: 'blockquote', content: [{ type: 'text', text: 'Quote' }] }
    case 'Link':
      return { type: 'paragraph', content: [{ type: 'link', text: 'Link text', href: '#' }] }
    case 'Image':
      return { type: 'paragraph', content: [{ type: 'text', text: 'Image placeholder' }] }
    case 'Table':
      return { type: 'paragraph', content: [{ type: 'text', text: 'Table placeholder' }] }
    default:
      return null
  }
}

function handleToolbarSelect(label: string) {
  const idx = toolbarState.value.blockIndex
  toolbarState.value = { visible: false, left: 0, top: 0, blockIndex: -1 }

  if (idx < 0 || idx >= blocks.value.length) return
  const block = blocks.value[idx]
  const transformed = transformBlock(block, label)
  if (transformed) {
    blocks.value[idx] = transformed
  }
}

const TOOLBAR_HEIGHT = 168
const TOOLBAR_GAP = 8

function handleMouseUp(e: MouseEvent) {
  const target = e.target
  if (target instanceof Element && target.closest('.selection-toolbar')) return

  setTimeout(() => {
    if (disposed) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      toolbarState.value.visible = false
      return
    }

    const range = selection.getRangeAt(0)
    const el = scrollRef.value
    if (!el || !el.contains(range.startContainer)) {
      toolbarState.value.visible = false
      return
    }

    let blockIndex = -1
    const startNode = range.startContainer
    let node: Node | null = startNode
    while (node && node !== el) {
      if (node instanceof HTMLElement) {
        const idx = (node as HTMLElement).dataset.blockIndex
        if (idx !== undefined) {
          blockIndex = parseInt(idx, 10)
          break
        }
      }
      node = node.parentNode
    }

    // Also check endContainer for cross-block selection
    let endIndex = -1
    const endNode = range.endContainer
    let endWalk: Node | null = endNode
    while (endWalk && endWalk !== el) {
      if (endWalk instanceof HTMLElement) {
        const idx = (endWalk as HTMLElement).dataset.blockIndex
        if (idx !== undefined) {
          endIndex = parseInt(idx, 10)
          break
        }
      }
      endWalk = endWalk.parentNode
    }

    if (blockIndex < 0 || endIndex < 0 || blockIndex !== endIndex) {
      toolbarState.value.visible = false
      return
    }

    const rangeRect = range.getBoundingClientRect()
    const toolbarWidth = 168
    let left = rangeRect.left + rangeRect.width / 2 - 80
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8))
    const spaceBelow = window.innerHeight - rangeRect.bottom

    let top: number
    if (spaceBelow >= TOOLBAR_HEIGHT + TOOLBAR_GAP) {
      top = rangeRect.bottom + TOOLBAR_GAP
    } else {
      top = rangeRect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP
    }
    top = Math.max(8, top)

    toolbarState.value = { visible: true, left, top, blockIndex }
  }, 10)
}

function handleMouseDown(e: MouseEvent) {
  const target = e.target
  if (!(target instanceof Element) || !target.closest('.selection-toolbar')) {
    toolbarState.value.visible = false
  }
}

onMounted(() => {
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('mousedown', handleMouseDown)
})

onUnmounted(() => {
  disposed = true
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('mousedown', handleMouseDown)
  cleanupDrag()
})
</script>

<template>
  <div class="editor">
    <div ref="scrollRef" class="editor-scroll" :class="{ 'drag-active': dragState.isDragging }">
      <template v-for="(block, index) in blocks" :key="index">
        <div v-if="index > 0" :class="spacerClass(block, blocks[index - 1])" />

        <div
          v-if="dragState.isDragging && dragState.dropIndex === index && dragState.dragIndex !== index"
          class="drop-indicator"
        />

        <EditorBlock
          :block-index="index"
          :is-drag-source="dragState.isDragging && dragState.dragIndex === index"
          @add-block="handleAddBlock(index, $event)"
          @drag-start="handleDragStart(index, $event)"
          @block-ref="handleBlockRef(index, $event)"
        >
          <component
            v-if="block.type === 'heading'"
            :is="'h' + block.level"
            :class="['editor-h', 'editor-h' + block.level]"
          >
            <InlineContent :content="block.content" />
          </component>

          <p v-else-if="block.type === 'paragraph'" class="editor-p">
            <InlineContent :content="block.content" />
          </p>

          <div v-else-if="block.type === 'ordered_list'" class="editor-list">
            <div v-for="(item, i) in block.items" :key="i" class="list-item">
              <span class="list-num">{{ i + 1 }}.</span>
              <span class="list-text">
                <InlineContent :content="item.content" />
              </span>
            </div>
          </div>

          <div v-else-if="block.type === 'bullet_list'" class="editor-list">
            <div v-for="(item, i) in block.items" :key="i" class="list-item">
              <span class="list-bullet">&bull;</span>
              <span class="list-text">
                <InlineContent :content="item.content" />
              </span>
            </div>
          </div>

          <div v-else-if="block.type === 'todo_list'" class="todo-list">
            <div v-for="(item, i) in block.items" :key="i" class="todo-item">
              <span class="todo-check" :class="{ done: item.checked }" />
              <span class="todo-text" :class="{ done: item.checked }">
                <InlineContent :content="item.content" />
              </span>
            </div>
          </div>

          <div v-else-if="block.type === 'code_block'" class="code-block">
            <div class="code-header">
              <span class="code-lang">{{ block.language }}</span>
              <button class="code-copy-btn"><Copy :size="14" /></button>
            </div>
            <div class="code-sep" />
            <div class="code-content">
              <div v-for="(line, i) in block.code.split('\n')" :key="i" class="code-line">
                {{ line }}
              </div>
            </div>
          </div>

          <blockquote v-else-if="block.type === 'blockquote'" class="editor-blockquote">
            <InlineContent :content="block.content" />
          </blockquote>
        </EditorBlock>
      </template>

      <div
        v-if="dragState.isDragging && dragState.dropIndex === blocks.length - 1 && dragState.dragIndex !== blocks.length - 1"
        class="drop-indicator"
      />
    </div>

    <SelectionToolbar
      v-if="toolbarState.visible"
      :block="blocks[toolbarState.blockIndex] ?? null"
      :style="{
        position: 'fixed',
        left: toolbarState.left + 'px',
        top: toolbarState.top + 'px',
        zIndex: 100,
      }"
      @select="handleToolbarSelect"
    />
  </div>
</template>

<style scoped>
.editor {
  flex: 1;
  overflow: hidden;
}

.editor-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 0 120px;
  position: relative;
}

.editor-h1 {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  line-height: 1.3;
  color: var(--foreground-primary);
}

.editor-h2 {
  font-size: var(--font-size-2xl);
  font-weight: 600;
  line-height: 1.3;
  color: var(--foreground-primary);
}

.editor-h3 {
  font-size: var(--font-size-xl);
  font-weight: 600;
  line-height: 1.3;
  color: var(--foreground-primary);
}

.editor-h4 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: 1.4;
  color: var(--foreground-primary);
}

.editor-p {
  font-size: var(--font-size-lg);
  line-height: 1.7;
  color: var(--foreground-secondary);
}

.editor-p strong {
  font-weight: 600;
  color: var(--foreground-primary);
}

.editor-spacer-lg {
  height: var(--spacing-xl);
}

.editor-spacer-md {
  height: var(--spacing-lg);
}

.editor-spacer-sm {
  height: var(--spacing-md);
}

.editor-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-item {
  display: flex;
  gap: 10px;
  line-height: 1.7;
  font-size: var(--font-size-lg);
  color: var(--foreground-secondary);
}

.list-num {
  flex-shrink: 0;
}

.list-bullet {
  flex-shrink: 0;
  color: var(--foreground-tertiary);
}

.list-text {
  line-height: 1.7;
}

.list-text strong {
  font-weight: 600;
  color: var(--foreground-primary);
}

.code-block {
  background-color: var(--code-bg);
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 20px;
}

.code-lang {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--foreground-tertiary);
}

.code-copy-btn {
  background: none;
  border: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.code-copy-btn:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}

.code-sep {
  height: 1px;
  background-color: var(--border-subtle);
}

.code-content {
  display: flex;
  flex-direction: column;
}

.code-line {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--foreground-secondary);
}

.code-line.comment {
  color: var(--foreground-tertiary);
}

.code-line.accent {
  color: var(--accent-primary);
}

.editor-blockquote {
  border-left: 3px solid var(--accent-primary);
  padding: 4px 0 4px 20px;
}

.editor-blockquote p,
.editor-blockquote {
  font-size: var(--font-size-lg);
  line-height: 1.7;
  color: var(--foreground-secondary);
  font-style: italic;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-check {
  width: 16px;
  height: 16px;
  border: 2px solid var(--foreground-tertiary);
  border-radius: 3px;
  flex-shrink: 0;
}

.todo-check.done {
  background-color: var(--accent-primary);
  border-color: var(--accent-primary);
  position: relative;
}

.todo-check.done::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0px;
  width: 5px;
  height: 9px;
  border: solid var(--foreground-inverse);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.todo-text {
  font-size: var(--font-size-lg);
  color: var(--foreground-secondary);
}

.todo-text.done {
  color: var(--foreground-tertiary);
  text-decoration: line-through;
}

.inline-code {
  font-family: var(--font-mono);
  font-size: 14px;
  background-color: var(--code-inline-bg);
  padding: 2px 6px;
  border-radius: 4px;
}

.drop-indicator {
  height: 2px;
  background-color: var(--accent-primary);
  border-radius: 1px;
  margin: -1px 0;
  pointer-events: none;
  animation: drop-indicator-appear 0.15s ease;
}

@keyframes drop-indicator-appear {
  from {
    opacity: 0;
    transform: scaleX(0.3);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}

.editor-scroll.drag-active {
  user-select: none;
  cursor: grabbing;
}

.editor-scroll.drag-active .editor-block:not(.is-dragging) .block-controls {
  opacity: 0 !important;
}
</style>
