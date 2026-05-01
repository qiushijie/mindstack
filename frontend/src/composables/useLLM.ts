import { ref } from 'vue'
import { Chat, StreamChat, GetActiveModelInfo } from '../../wailsjs/go/main/App'
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

  return { loading, error, chat, streamChat, cancelStream, getActiveModel }
}
