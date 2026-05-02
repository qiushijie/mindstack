<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useLLM, type ChatMessage } from '../composables/useLLM'
import { useSync } from '../composables/useSync'
import { useSearch } from '../composables/useSearch'
import { EventsOff } from '../../wailsjs/runtime/runtime'

interface MessageLink {
  path: string
  title: string
}

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  links?: MessageLink[]
}

const emit = defineEmits<{ close: []; openFile: [path: string] }>()

const { streamChat, cancelStream } = useLLM()
const { syncWorkspace } = useSync()
const { searchDocs } = useSearch()
const messages = ref<DisplayMessage[]>([])
const inputText = ref('')
const messageAreaEl = ref<HTMLElement>()
const textareaEl = ref<HTMLTextAreaElement>()
const isStreaming = ref(false)
const activeStreamIdx = ref(-1)
const panelEl = ref<HTMLElement>()
const showToolMenu = ref(false)

const PANEL_W = 380
const PANEL_H = 600
const MARGIN = 8

const panelX = ref(0)
const panelY = ref(0)
let dragStartX = 0
let dragStartY = 0
let dragStartPanelX = 0
let dragStartPanelY = 0

const SYSTEM_PROMPT = 'You are a helpful AI assistant. Answer concisely and clearly.'

function clampPosition(x: number, y: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.max(MARGIN, Math.min(x, vw - PANEL_W - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, vh - PANEL_H - MARGIN)),
  }
}

function resetPosition() {
  const vw = window.innerWidth
  const pos = clampPosition(vw - PANEL_W - 16, 52)
  panelX.value = pos.x
  panelY.value = pos.y
}

function onDragStart(e: MouseEvent) {
  e.preventDefault()
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartPanelX = panelX.value
  dragStartPanelY = panelY.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  const pos = clampPosition(dragStartPanelX + dx, dragStartPanelY + dy)
  panelX.value = pos.x
  panelY.value = pos.y
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

onMounted(() => {
  resetPosition()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  EventsOff('sync:progress')
  stopStreaming()
})

function sendMessage() {
  const text = inputText.value.trim()
  if (isStreaming.value) return
  if (!text && !selectedTool.value) return

  if (selectedTool.value?.command === '/search') {
    runSearch(text)
    return
  }
  const fullText = selectedTool.value
    ? selectedTool.value.command + (text ? ' ' + text : '')
    : text

  inputText.value = ''
  selectedTool.value = null
  if (textareaEl.value) {
    textareaEl.value.style.height = 'auto'
  }

  messages.value.push({ role: 'user', content: fullText })

  const idx = messages.value.length
  messages.value.push({ role: 'assistant', content: '', isStreaming: true })
  activeStreamIdx.value = idx
  isStreaming.value = true

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.value.slice(0, idx).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  streamChat(
    chatMessages,
    (chunk) => {
      if (activeStreamIdx.value !== idx) return
      messages.value[idx].content += chunk
      scrollToBottom()
    },
    () => finishStream(idx),
    (err) => {
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        messages.value[idx].content += `\n\nError: ${err}`
      }
      finishStream(idx)
    },
  )

  scrollToBottom()
}

function finishStream(idx: number) {
  if (messages.value[idx]) {
    messages.value[idx].isStreaming = false
  }
  if (activeStreamIdx.value === idx) {
    activeStreamIdx.value = -1
    isStreaming.value = false
  }
}

function stopStreaming() {
  cancelStream()
  if (activeStreamIdx.value >= 0) {
    finishStream(activeStreamIdx.value)
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messageAreaEl.value) {
      messageAreaEl.value.scrollTop = messageAreaEl.value.scrollHeight
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function handleClose() {
  stopStreaming()
  emit('close')
}

interface ToolMenuItem {
  command: string
  label: string
  icon: string
  placeholder: string
}

const toolMenuItems: ToolMenuItem[] = [
  { command: '/search', label: 'Search', icon: 'search', placeholder: 'Enter tags to search...' },
  { command: '/sync', label: 'Sync', icon: 'refresh-cw', placeholder: '' },
]

const selectedTool = ref<ToolMenuItem | null>(null)

function toggleToolMenu() {
  showToolMenu.value = !showToolMenu.value
}

function selectToolItem(item: ToolMenuItem) {
  showToolMenu.value = false
  selectedTool.value = item
  if (item.command === '/sync') {
    runSync()
    return
  }
  if (item.command === '/search') {
    inputText.value = ''
    textareaEl.value?.focus()
    return
  }
  if (!item.placeholder) {
    inputText.value = ''
    sendMessage()
    return
  }
  inputText.value = ''
  textareaEl.value?.focus()
}

function clearToolSelection() {
  selectedTool.value = null
}

function runSync() {
  inputText.value = ''
  selectedTool.value = null
  isStreaming.value = true

  messages.value.push({ role: 'user', content: '/sync' })

  const idx = messages.value.length
  messages.value.push({ role: 'assistant', content: 'Starting sync...', isStreaming: true })
  activeStreamIdx.value = idx

  syncWorkspace(
    (progress) => {
      if (activeStreamIdx.value !== idx) return
      if (progress.phase === 'meta') {
        if (progress.status === 'processing') {
          messages.value[idx].content = `Syncing (${progress.current}/${progress.total}): ${progress.file}...`
        } else if (progress.status === 'done') {
          messages.value[idx].content = `Synced (${progress.current}/${progress.total}): ${progress.file}`
        } else if (progress.status === 'skipped') {
          messages.value[idx].content = `No changes (${progress.current}/${progress.total}): ${progress.file}`
        } else if (progress.status === 'complete') {
          messages.value[idx].content = progress.total > 0
            ? `Meta sync complete. Analyzing relations...`
            : 'No markdown files found in workspace.'
        } else if (progress.status === 'error') {
          messages.value[idx].content += `\nError on ${progress.file}: ${progress.error}`
        }
      } else if (progress.phase === 'relation') {
        if (progress.status === 'analyzing') {
          messages.value[idx].content = `Analyzing relations (${progress.current}/${progress.total}): ${progress.file}`
        } else if (progress.status === 'done') {
          messages.value[idx].content = `Analyzed (${progress.current}/${progress.total}): ${progress.file}`
        } else if (progress.status === 'complete') {
          messages.value[idx].content = 'Sync complete.'
        } else if (progress.status === 'error') {
          messages.value[idx].content += `\nRelation error on ${progress.file}: ${progress.error}`
        }
      }
      scrollToBottom()
    },
    () => finishStream(idx),
    (err) => {
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        messages.value[idx].content += `\n\nSync error: ${err}`
      }
      finishStream(idx)
    },
  )

  scrollToBottom()
}

function runSearch(query: string) {
  if (!query.trim()) return
  inputText.value = ''
  selectedTool.value = null
  isStreaming.value = true

  messages.value.push({ role: 'user', content: `/search ${query}` })

  const idx = messages.value.length
  messages.value.push({ role: 'assistant', content: 'Searching...', isStreaming: true })
  activeStreamIdx.value = idx

  searchDocs(query).then((result) => {
    if (activeStreamIdx.value !== idx) return
    if (!result) {
      messages.value[idx].content = 'No results found.'
      finishStream(idx)
      return
    }
    if (result.items && result.items.length > 0) {
      messages.value[idx].content = `Found ${result.total} document(s) for tag "${result.tag}":`
      messages.value[idx].links = result.items.map(
        (item: { path: string; abs_path: string; title: string }) => ({ path: item.abs_path || item.path, title: item.title || item.path }),
      )
    } else {
      messages.value[idx].content = `No documents found for tag "${query}".`
    }
    finishStream(idx)
    scrollToBottom()
  }).catch((err: any) => {
    if (activeStreamIdx.value === idx && messages.value[idx]) {
      messages.value[idx].content += `\n\nError: ${String(err)}`
    }
    finishStream(idx)
  })

  scrollToBottom()
}

</script>

<template>
  <div
    ref="panelEl"
    class="ai-chat-panel"
    :style="{ left: panelX + 'px', top: panelY + 'px' }"
  >
    <div class="chat-header" @mousedown="onDragStart">
      <span class="chat-title">AI Assistant</span>
      <button class="close-btn" @mousedown.stop @click="handleClose" title="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>
    </div>

    <div class="message-area" ref="messageAreaEl">
      <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role]">
        <div v-if="msg.role === 'assistant'" class="ai-label">AI</div>
        <div :class="['bubble', msg.role]">
          <span class="bubble-text">{{ msg.content }}</span>
          <template v-if="msg.links && msg.links.length">
            <div class="link-list">
              <a
                v-for="link in msg.links"
                :key="link.path"
                class="doc-link"
                href="#"
                @click.prevent="emit('openFile', link.path)"
              >{{ link.title }}</a>
            </div>
          </template>
          <span v-if="msg.isStreaming" class="cursor" />
        </div>
      </div>
    </div>

    <div class="input-area" @mousedown.stop>
      <div class="tool-menu-wrapper" @mousedown.stop>
        <button class="tool-btn" :class="{ active: showToolMenu || selectedTool }" @click="selectedTool ? clearToolSelection() : toggleToolMenu()" :title="selectedTool ? selectedTool.label : 'Tools'">
          <svg v-if="selectedTool?.icon === 'search'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'git-branch'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'refresh-cw'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
        <div v-if="showToolMenu" class="tool-menu" @click.stop>
          <button v-for="item in toolMenuItems" :key="item.command" class="tool-menu-item" @click="selectToolItem(item)">
            <svg v-if="item.icon === 'search'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <svg v-else-if="item.icon === 'git-branch'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <svg v-else-if="item.icon === 'refresh-cw'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
            </svg>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
      <textarea
        ref="textareaEl"
        v-model="inputText"
        class="chat-input"
        :placeholder="selectedTool?.placeholder || 'Ask anything...'"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
      />
      <button v-if="!isStreaming" class="send-btn" @click="sendMessage" title="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
        </svg>
      </button>
      <button v-else class="stop-btn" @click="stopStreaming" title="Stop">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-panel {
  position: fixed;
  width: 380px;
  height: 600px;
  display: flex;
  flex-direction: column;
  background: var(--surface-primary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 12px 12px 0 0;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}

.chat-header:active {
  cursor: grabbing;
}

.chat-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground-primary);
  font-family: var(--font-sans);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  border-radius: 6px;
  padding: 0;
}

.close-btn:hover {
  background: var(--surface-hover);
  color: var(--foreground-secondary);
}

.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.message-area::-webkit-scrollbar {
  width: 4px;
}

.message-area::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 2px;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message.user {
  align-items: flex-end;
}

.message.assistant {
  align-items: flex-start;
}

.ai-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-primary);
  font-family: var(--font-sans);
  padding-left: 2px;
}

.bubble {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 300px;
  word-wrap: break-word;
  white-space: pre-wrap;
  font-family: var(--font-sans);
}

.bubble.user {
  background: var(--accent-primary);
  color: var(--foreground-inverse);
  border-radius: 12px 12px 4px 12px;
}

.bubble.assistant {
  background: var(--surface-secondary);
  color: var(--foreground-primary);
  border-radius: 12px 12px 12px 4px;
}

.link-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.doc-link {
  font-size: 12px;
  color: var(--accent-primary);
  text-decoration: none;
  word-break: break-all;
}

.doc-link:hover {
  text-decoration: underline;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--accent-primary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.input-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: var(--surface-secondary);
  border: none;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--foreground-primary);
  font-family: var(--font-sans);
  resize: none;
  outline: none;
  line-height: 1.5;
  max-height: 120px;
}

.chat-input::placeholder {
  color: var(--foreground-tertiary);
}

.send-btn,
.stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.send-btn {
  background: var(--accent-primary);
  color: var(--foreground-inverse);
}

.send-btn:hover {
  background: var(--accent-hover);
}

.stop-btn {
  background: var(--danger-primary);
  color: var(--foreground-inverse);
}

.stop-btn:hover {
  background: var(--danger-hover);
}

.tool-menu-wrapper {
  position: relative;
  flex-shrink: 0;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  background: var(--surface-secondary);
  padding: 0;
}

.tool-btn:hover {
  color: var(--foreground-secondary);
  background: var(--surface-hover);
}

.tool-btn.active {
  color: var(--accent-primary);
  background: var(--surface-hover);
}

.tool-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: -8px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 4px;
  min-width: 160px;
  z-index: 1001;
}

.tool-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  border-radius: 6px;
}

.tool-menu-item:hover {
  background: var(--surface-hover);
}

.tool-menu-item svg {
  color: var(--foreground-secondary);
  flex-shrink: 0;
}
</style>
