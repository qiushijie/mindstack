import { ref } from 'vue'
import { Chat, StreamChat, StreamChatWithHistory, GetActiveModelInfo } from '../../wailsjs/go/main/App'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ModelInfo {
  configured: boolean
  id?: string
  model?: string
}

export interface StreamChatHistoryRequest {
  sessionId: number
  workspacePath: string
  messages: ChatMessage[]
  userMessage: string
  currentContent?: string
  selectedText?: string
  selectionFrom?: number
  selectionTo?: number
  filePath?: string
}

export function useLLM() {
  const loading = ref(false)
  const error = ref('')

  async function chat(messages: ChatMessage[]): Promise<string> {
    loading.value = true
    error.value = ''
    try {
      const result = await Chat(JSON.stringify(messages))
      const parsed = JSON.parse(result)
      if (parsed.error) {
        error.value = parsed.error
        return ''
      }
      return parsed.content || ''
    } catch (err: any) {
      error.value = err.message || 'Chat failed'
      return ''
    } finally {
      loading.value = false
    }
  }

  let cleaned = false
  function cleanup() {
    if (cleaned) return
    cleaned = true
    loading.value = false
    EventsOff('llm:chunk')
  }

  function cancelStream() {
    cleanup()
  }

  // Track the active stream request to prevent EventsOff/EventsOn race condition
  let activeRequestId = 0
  let currentOnChunk: ((content: string) => void) | null = null
  let currentOnDone: (() => void) | null = null
  let currentOnError: ((err: string) => void) | null = null
  let receivedAnyChunk = false

  // Set up chat:message:chunk listener once to avoid race condition
  let chatMessageChunkHandlerSetUp = false
  function ensureChatMessageChunkListener() {
    if (chatMessageChunkHandlerSetUp) return
    chatMessageChunkHandlerSetUp = true
    EventsOn('chat:message:chunk', (data: string) => {
      if (activeRequestId === 0) return
      let chunk: any
      try {
        chunk = JSON.parse(data)
      } catch { return }

      if (chunk.error) {
        activeRequestId = 0
        currentOnError?.(chunk.error)
      } else if (chunk.done) {
        activeRequestId = 0
        if (chunk.content && !receivedAnyChunk) {
          currentOnChunk?.(chunk.content)
        }
        currentOnDone?.()
      } else if (chunk.content) {
        receivedAnyChunk = true
        currentOnChunk?.(chunk.content)
      }
    })
  }

  async function streamChatWithHistory(
    req: StreamChatHistoryRequest,
    onChunk: (content: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ): Promise<number> {
    ensureChatMessageChunkListener()

    activeRequestId += 1
    receivedAnyChunk = false
    currentOnChunk = onChunk
    currentOnDone = onDone
    currentOnError = onError

    try {
      const result = await StreamChatWithHistory(JSON.stringify(req))
      const parsed = JSON.parse(result)
      if (parsed.error) {
        if (activeRequestId !== 0) {
          activeRequestId = 0
          onError(parsed.error)
        }
        return 0
      }
      return parsed.sessionId || 0
    } catch (err: any) {
      if (activeRequestId !== 0) {
        activeRequestId = 0
        onError(err.message || 'Stream failed')
      }
      return 0
    }
  }

  function streamChat(
    messages: ChatMessage[],
    onChunk: (content: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) {
    // Always clean up any previous listener before starting a new stream
    EventsOff('llm:chunk')
    cleaned = false

    loading.value = true
    error.value = ''

    EventsOn('llm:chunk', (data: string) => {
      let chunk: any
      try {
        chunk = JSON.parse(data)
      } catch {
        return
      }
      if (chunk.error) {
        error.value = chunk.error
        onError(chunk.error)
        cleanup()
      } else if (chunk.done) {
        cleanup()
        onDone()
      } else if (chunk.content) {
        onChunk(chunk.content)
      }
    })

    StreamChat(JSON.stringify(messages)).catch((err: any) => {
      error.value = err.message || 'Stream failed'
      onError(error.value)
      cleanup()
    })
  }

  async function getActiveModel(): Promise<ModelInfo> {
    try {
      const result = await GetActiveModelInfo()
      return JSON.parse(result)
    } catch {
      return { configured: false }
    }
  }

  return { loading, error, chat, streamChat, streamChatWithHistory, cancelStream, getActiveModel }
}
