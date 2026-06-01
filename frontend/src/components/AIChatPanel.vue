<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useLLM, type ChatMessage } from '../composables/useLLM'
import { useBuild } from '../composables/useBuild'
import { useSearch } from '../composables/useSearch'
import { type AckSnippet } from '../composables/useAck'
import { useSettings } from '../composables/useSettings'
import { useChatHistory, type ChatMessageRecord } from '../composables/useChatHistory'
import { useAIEdit, type ChangeBlock } from '../composables/useAIEdit'
import { useFileTree } from '../composables/useFileTree'
import { useDiffView } from '../composables/useDiffView'
import { isPageTab } from '../composables/useTabs'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'
import { GitCheckInit, GitInit, GitPull, GitCommit, GitAutoCommit, GitPush } from '../../wailsjs/go/main/App'

interface MessageLink {
  path: string
  title: string
  summary?: string
}

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  isEdit?: boolean
  isAction?: boolean
  links?: MessageLink[]
  snippets?: AckSnippet[]
}

const emit = defineEmits<{ close: []; openFile: [path: string] }>()

const { streamChat, streamChatWithHistory, cancelStream } = useLLM()
const { buildWorkspace } = useBuild()
const { searchDocs } = useSearch()
const { defaultBranch } = useSettings()
const { sessions, currentSessionId, loadSessions, createSession, loadHistory, deleteSession, switchSession } = useChatHistory()
const { isEditing, applyEdit, applyChanges, getCurrentDocument, getModifiedDocument, getSelection } = useAIEdit()
const { rootPath, selectedFilePath } = useFileTree()
const { openDiffView, clearDiffState, pendingCount } = useDiffView()

const diffPending = computed(() => pendingCount.value > 0)

const messages = ref<DisplayMessage[]>([])
const inputText = ref('')
const messageAreaEl = ref<HTMLElement>()
const textareaEl = ref<HTMLTextAreaElement>()
const isStreaming = ref(false)
const activeStreamIdx = ref(-1)
const panelEl = ref<HTMLElement>()
const showToolMenu = ref(false)
const gitSyncTimer = ref<ReturnType<typeof setTimeout>>()
const showHistoryView = ref(false)
const pendingEditContent = ref('')
const pendingEditChanges = ref<ChangeBlock[]>([])

// Track which message index the edit listener should handle (prevents race condition)
let currentEditIdx = -1

const PANEL_W = 380
const PANEL_H = 600
const MARGIN = 8

const panelX = ref(0)
const panelY = ref(0)
let dragStartX = 0
let dragStartY = 0
let dragStartPanelX = 0
let dragStartPanelY = 0

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
  if (rootPath.value) {
    loadSessions(rootPath.value)
  }

  // E2E hooks
  ;(window as any).__toggleToolMenu = () => {
    showToolMenu.value = !showToolMenu.value
  }
  ;(window as any).__selectToolByIndex = (idx: number) => {
    if (idx >= 0 && idx < toolMenuItems.length) {
      selectToolItem(toolMenuItems[idx])
    }
  }
  ;(window as any).__clearToolSelection = () => {
    selectedTool.value = null
  }

  // Set up edit listener once to avoid EventsOff/EventsOn race condition
  EventsOn('chat:edit:chunk', (data: string) => {
    let chunk: any
    try {
      chunk = JSON.parse(data)
    } catch { return }

    const idx = currentEditIdx
    if (idx < 0 || idx >= messages.value.length) return

    if (chunk.error) {
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        messages.value[idx].content += `\n\nError: ${chunk.error}`
      }
      finishStream(idx)
      return
    }

    if (chunk.explanation) {
      if (activeStreamIdx.value !== idx) return
      messages.value[idx].content = chunk.explanation
      messages.value[idx].isEdit = true
      scrollToBottom()
    }

    if (chunk.content) {
      pendingEditContent.value = chunk.content
      if (chunk.changes) {
        pendingEditChanges.value = chunk.changes
      }
    }

    if (chunk.done) {
      finishStream(idx)
      // Open diff view for review
      const original = getCurrentDocument()
      if (pendingEditContent.value) {
        const modified = getModifiedDocument(original, pendingEditContent.value)
        openDiffView(original, modified, selectedFilePath.value || 'document')
      }
    }
  })
})

watch(rootPath, (newPath) => {
  if (newPath) {
    loadSessions(newPath)
  } else {
    sessions.value = []
    currentSessionId.value = 0
    messages.value = []
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  EventsOff('build:progress')
  EventsOff('chat:edit:chunk')
  if (gitSyncTimer.value) clearTimeout(gitSyncTimer.value)
  stopStreaming()
  delete (window as any).__toggleToolMenu
  delete (window as any).__selectToolByIndex
  delete (window as any).__clearToolSelection
})

function sendMessage() {
  const text = inputText.value.trim()
  if (isStreaming.value) return
  if (diffPending.value) return
  if (!text && !selectedTool.value) return

  if (selectedTool.value?.command === '/search') {
    runSearch(text)
    return
  }
  if (selectedTool.value?.command === '/git') {
    runGitSync(text)
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
  messages.value.push({ role: 'assistant', content: '', isStreaming: true, isEdit: false })
  activeStreamIdx.value = idx
  isStreaming.value = true
  pendingEditContent.value = ''
  pendingEditChanges.value = []

  const chatMessages: ChatMessage[] = messages.value.slice(0, idx).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Get selection info for the agent
  const sel = getSelection ? getSelection() : null

  // Mark which message index the edit listener should handle
  currentEditIdx = idx

  // Use persistent chat API
  streamChatWithHistory(
    {
      sessionId: currentSessionId.value,
      workspacePath: rootPath.value,
      messages: chatMessages,
      userMessage: fullText,
      currentContent: getCurrentDocument(),
      selectedText: sel?.text || '',
      selectionFrom: sel?.from || 0,
      selectionTo: sel?.to || 0,
      filePath: selectedFilePath.value || '',
    },
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
  ).then((sessionId) => {
    if (sessionId && !currentSessionId.value) {
      currentSessionId.value = sessionId
    }
  })

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
    if (!diffPending.value) {
      sendMessage()
    }
  }
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function handleClose() {
  stopStreaming()
  showHistoryView.value = false
  emit('close')
}

function openHistoryView() {
  showHistoryView.value = true
}

function closeHistoryView() {
  showHistoryView.value = false
}

function onSessionClick(sessionId: number) {
  loadSession(sessionId)
  showHistoryView.value = false
}

interface ToolMenuItem {
  command: string
  label: string
  icon: string
  placeholder: string
}

const toolMenuItems: ToolMenuItem[] = [
  { command: '/search', label: 'Search', icon: 'search', placeholder: 'Enter tags to search...' },
  { command: '/git', label: 'Git Sync', icon: 'git-branch', placeholder: 'Enter "push" or "pull"...' },
  { command: '/build', label: 'Build', icon: 'refresh-cw', placeholder: '' },
]

const selectedTool = ref<ToolMenuItem | null>(null)

function toggleToolMenu() {
  showToolMenu.value = !showToolMenu.value
}

function selectToolItem(item: ToolMenuItem) {
  showToolMenu.value = false
  selectedTool.value = item
  if (item.command === '/build') {
    runBuild()
    return
  }
  if (item.command === '/git') {
    inputText.value = ''
    textareaEl.value?.focus()
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

function runBuild() {
  inputText.value = ''
  selectedTool.value = null
  isStreaming.value = true

  messages.value.push({ role: 'user', content: '/build' })

  const idx = messages.value.length
  messages.value.push({ role: 'assistant', content: 'Starting build...', isStreaming: true })
  activeStreamIdx.value = idx

  buildWorkspace(
    (progress) => {
      if (activeStreamIdx.value !== idx) return
      if (progress.phase === 'meta') {
        if (progress.status === 'processing') {
          messages.value[idx].content = `Building (${progress.current}/${progress.total}): ${progress.file}...`
        } else if (progress.status === 'done') {
          messages.value[idx].content = `Built (${progress.current}/${progress.total}): ${progress.file}`
        } else if (progress.status === 'skipped') {
          messages.value[idx].content = `No changes (${progress.current}/${progress.total}): ${progress.file}`
        } else if (progress.status === 'complete') {
          messages.value[idx].content = progress.total > 0
            ? `Meta build complete. Analyzing relations...`
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
          messages.value[idx].content = 'Build complete.'
        } else if (progress.status === 'error') {
          messages.value[idx].content += `\nRelation error on ${progress.file}: ${progress.error}`
        }
      }
      scrollToBottom()
    },
    () => finishStream(idx),
    (err) => {
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        messages.value[idx].content += `\n\nBuild error: ${err}`
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
      messages.value[idx].content = `Found ${result.total} document(s) for tag(s) "${result.tag}":`
      messages.value[idx].links = result.items.map(
        (item: { path: string; abs_path: string; title: string; summary?: string }) => ({ path: item.abs_path || item.path, title: item.title || item.path, summary: item.summary }),
      )
    } else {
      messages.value[idx].content = `No documents found for tag(s) "${query}".`
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

async function runGitSync(action: string) {
  const trimmed = action.trim().toLowerCase()
  inputText.value = ''
  selectedTool.value = null

  messages.value.push({ role: 'user', content: `/git ${trimmed}` })

  if (trimmed !== 'push' && trimmed !== 'pull' && trimmed !== 'init') {
    messages.value.push({ role: 'assistant', content: `Invalid action "${trimmed}". Please enter "push", "pull", or "init".` })
    scrollToBottom()
    return
  }

  const idx = messages.value.length
  messages.value.push({ role: 'assistant', content: `Git ${trimmed} in progress...`, isStreaming: true })
  activeStreamIdx.value = idx
  isStreaming.value = true

  try {
    if (trimmed === 'init') {
      const result = await GitInit(defaultBranch.value)
      const data = JSON.parse(result)
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        if (data.error) {
          messages.value[idx].content = `Init failed: ${data.error}`
        } else {
          messages.value[idx].content = 'Git repository initialized successfully.'
        }
        messages.value[idx].isStreaming = false
      }
      finishStream(idx)
      scrollToBottom()
      return
    } else if (trimmed === 'pull') {
      const gitInit = await GitCheckInit()
      if (!gitInit) {
        if (activeStreamIdx.value === idx && messages.value[idx]) {
          messages.value[idx].content = 'This workspace is not a git repository. Use `/git init` to initialize first.'
          messages.value[idx].isStreaming = false
        }
        finishStream(idx)
        scrollToBottom()
        return
      }
      const result = await GitPull()
      const data = JSON.parse(result)
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        if (data.error) {
          messages.value[idx].content = `Pull failed: ${data.error}`
        } else {
          messages.value[idx].content = 'Pull completed successfully.'
        }
        messages.value[idx].isStreaming = false
      }
    } else if (trimmed === 'push') {
      const gitInit = await GitCheckInit()
      if (!gitInit) {
        if (activeStreamIdx.value === idx && messages.value[idx]) {
          messages.value[idx].content = 'This workspace is not a git repository. Use `/git init` to initialize first.'
          messages.value[idx].isStreaming = false
        }
        finishStream(idx)
        scrollToBottom()
        return
      }
      const commitResult = await GitAutoCommit()
      const commitData = JSON.parse(commitResult)
      if (commitData.error && commitData.error !== 'nothing to commit') {
        if (activeStreamIdx.value === idx && messages.value[idx]) {
          messages.value[idx].content = `Auto-commit failed: ${commitData.error}`
          messages.value[idx].isStreaming = false
        }
        finishStream(idx)
        scrollToBottom()
        return
      }

      const result = await GitPush()
      const data = JSON.parse(result)
      if (activeStreamIdx.value === idx && messages.value[idx]) {
        if (data.error) {
          messages.value[idx].content = `Push failed: ${data.error}`
        } else {
          const commitInfo = commitData.message && commitData.message !== 'nothing to commit'
            ? ` Committed: "${commitData.message}".`
            : ''
          messages.value[idx].content = `Push completed successfully.${commitInfo}`
        }
        messages.value[idx].isStreaming = false
      }
    }
  } catch (err) {
    if (activeStreamIdx.value === idx && messages.value[idx]) {
      messages.value[idx].content = `Git error: ${String(err)}`
      messages.value[idx].isStreaming = false
    }
  }

  if (activeStreamIdx.value === idx) {
    activeStreamIdx.value = -1
    isStreaming.value = false
  }
  scrollToBottom()
}

// --- Session Management ---

function startNewSession() {
  currentSessionId.value = 0
  messages.value = []
  if (rootPath.value) {
    createSession(rootPath.value)
  }
}

async function loadSession(sessionId: number) {
  if (!sessionId) return
  switchSession(sessionId)
  const history = await loadHistory(sessionId)
  messages.value = history.map((m: ChatMessageRecord) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  nextTick(() => scrollToBottom())
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function handleDeleteSession(sessionId: number, e: Event) {
  e.stopPropagation()
  deleteSession(sessionId, rootPath.value)
}

</script>

<template>
  <div
    ref="panelEl"
    class="ai-chat-panel"
    :style="{ left: panelX + 'px', top: panelY + 'px' }"
  >
    <div class="chat-header" @mousedown="onDragStart">
      <div class="chat-header-left">
        <button v-if="showHistoryView" class="back-btn" @mousedown.stop @click="closeHistoryView" title="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <span class="chat-title">{{ showHistoryView ? 'Chat History' : 'AI Assistant' }}</span>
      </div>
      <div class="chat-header-actions">
        <button v-if="!showHistoryView" class="history-btn" @mousedown.stop @click="openHistoryView" title="Chat History">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
          </svg>
        </button>
        <button class="close-btn" @mousedown.stop @click="handleClose" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- History View -->
    <div v-if="showHistoryView" class="history-view">
      <div class="history-list">
        <div v-if="sessions.length === 0" class="history-empty">No sessions</div>
        <div
          v-for="session in sessions"
          :key="session.id"
          :class="['history-item', { active: session.id === currentSessionId }]"
          @click="onSessionClick(session.id)"
        >
          <div class="history-item-info">
            <span class="history-item-title">{{ session.title || 'New Chat' }}</span>
            <span class="history-item-time">{{ formatTime(session.updatedAt) }}</span>
          </div>
          <button class="history-delete-btn" @click="handleDeleteSession(session.id, $event)" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
      <div class="history-footer">
        <button class="history-new-btn" @click="startNewSession(); closeHistoryView()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
          <span>New Chat</span>
        </button>
      </div>
    </div>

    <!-- Chat View -->
    <template v-else>
      <div class="message-area" ref="messageAreaEl">
      <div v-for="(msg, idx) in messages" :key="msg.role + '-' + idx" :class="['message', msg.role]">
        <div v-if="msg.role === 'assistant'" class="ai-label">
          <span>AI</span>
          <span v-if="msg.isEdit" class="edit-badge">Edit</span>
        </div>
        <div :class="['bubble', msg.role]">
          <span class="bubble-text">{{ msg.content }}</span>
          <template v-if="msg.links && msg.links.length">
            <div class="link-list">
              <template v-for="link in msg.links" :key="link.path">
                <a
                  class="doc-link"
                  href="#"
                  @click.prevent="emit('openFile', link.path)"
                >{{ link.title }}</a>
                <div v-if="link.summary" class="doc-summary">{{ link.summary }}</div>
              </template>
            </div>
          </template>
          <template v-if="msg.snippets && msg.snippets.length">
            <div class="snippet-list">
              <div
                v-for="(snippet, sIdx) in msg.snippets"
                :key="`${snippet.path}-${snippet.startLine}-${sIdx}`"
                class="snippet-card"
              >
                <a
                  class="snippet-link"
                  href="#"
                  @click.prevent="emit('openFile', snippet.path)"
                >{{ snippet.path }}:{{ snippet.startLine }}-{{ snippet.endLine }}</a>
                <pre class="snippet-content">{{ snippet.content }}</pre>
              </div>
            </div>
          </template>
          <span v-if="msg.isStreaming" class="cursor" />
        </div>
      </div>
    </div>

    <div v-if="diffPending" class="diff-pending-bar">
      Please accept or reject all changes in the diff view before continuing.
    </div>

    <div class="input-area" :class="{ disabled: diffPending }" @mousedown.stop>
      <div class="tool-menu-wrapper" @mousedown.stop>
        <button class="tool-btn" :class="{ active: showToolMenu || selectedTool }" @click="selectedTool ? clearToolSelection() : toggleToolMenu()" :title="selectedTool ? selectedTool.label : 'Tools'">
          <svg v-if="selectedTool?.icon === 'search'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'help-circle'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" x2="12.01" y1="17" y2="17" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'git-branch'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'refresh-cw'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'edit'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          <svg v-else-if="selectedTool?.icon === 'pen-tool'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.5 8.6" /><path d="M22 22l-5.5-5.5" />
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
            <svg v-else-if="item.icon === 'help-circle'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
            <svg v-else-if="item.icon === 'git-branch'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <svg v-else-if="item.icon === 'refresh-cw'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
            </svg>
            <svg v-else-if="item.icon === 'edit'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <svg v-else-if="item.icon === 'pen-tool'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.5 8.6" /><path d="M22 22l-5.5-5.5" />
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
        :disabled="diffPending"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
      />
      <button v-if="!isStreaming" class="send-btn" :disabled="diffPending" @click="sendMessage" title="Send">
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
  </template>
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
  padding: 0 12px;
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 12px 12px 0 0;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}

.chat-header:active {
  cursor: grabbing;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.back-btn {
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

.back-btn:hover {
  background: var(--surface-hover);
  color: var(--foreground-secondary);
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

/* History View */
.history-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.history-list::-webkit-scrollbar {
  width: 4px;
}

.history-list::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 2px;
}

.history-empty {
  font-size: 13px;
  color: var(--foreground-tertiary);
  padding: 32px 16px;
  text-align: center;
  font-family: var(--font-sans);
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.history-item:hover {
  background: var(--surface-hover);
}

.history-item.active {
  background: var(--surface-secondary);
}

.history-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.history-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground-primary);
  font-family: var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-time {
  font-size: 11px;
  color: var(--foreground-tertiary);
  font-family: var(--font-sans);
}

.history-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
}

.history-item:hover .history-delete-btn {
  opacity: 1;
}

.history-delete-btn:hover {
  background: var(--danger-primary);
  color: #fff;
}

.history-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.history-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: var(--accent-primary);
  color: var(--foreground-inverse);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-sans);
  cursor: pointer;
}

.history-new-btn:hover {
  background: var(--accent-hover);
}

/* History Button */
.history-btn {
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

.history-btn:hover {
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
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-primary);
  font-family: var(--font-sans);
  padding-left: 2px;
}

.edit-badge {
  font-size: 9px;
  padding: 1px 5px;
  background: var(--accent-primary);
  color: var(--foreground-inverse);
  border-radius: 4px;
  font-weight: 500;
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

.doc-summary {
  font-size: 11px;
  color: var(--text-muted);
  margin: -2px 0 4px 0;
  line-height: 1.4;
}

.snippet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.snippet-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
}

.snippet-link {
  font-size: 11px;
  color: var(--accent-primary);
  text-decoration: none;
  word-break: break-all;
  font-family: var(--font-mono, monospace);
}

.snippet-link:hover {
  text-decoration: underline;
}

.snippet-content {
  font-size: 11px;
  color: var(--foreground-primary);
  background: var(--surface-secondary);
  border-radius: 4px;
  padding: 6px 8px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono, monospace);
  line-height: 1.5;
  max-height: 240px;
  overflow-y: auto;
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

.diff-pending-bar {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--foreground-primary);
  background: var(--surface-secondary);
  border-top: 1px solid var(--border-subtle);
  text-align: center;
  flex-shrink: 0;
}

.input-area.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-area.disabled .chat-input {
  cursor: not-allowed;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn:disabled:hover {
  background: var(--accent-primary);
}
</style>
