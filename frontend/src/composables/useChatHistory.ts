import { ref, type Ref } from 'vue'
import {
  ChatCreateSession,
  ChatListSessions,
  ChatGetHistory,
  ChatDeleteSession,
} from '../../wailsjs/go/main/App'

export interface ChatSession {
  id: number
  workspacePath: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessageRecord {
  id: number
  sessionId: number
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: string
}

const sessions: Ref<ChatSession[]> = ref([])
const currentSessionId: Ref<number> = ref(0)

export function useChatHistory() {
  async function loadSessions(workspacePath: string) {
    if (!workspacePath) {
      sessions.value = []
      return
    }
    try {
      const result = await ChatListSessions(workspacePath)
      const data = JSON.parse(result)
      if (data.error) {
        console.error('Failed to load sessions:', data.error)
        sessions.value = []
        return
      }
      sessions.value = Array.isArray(data) ? data : []
    } catch (err) {
      console.error('Failed to load sessions:', err)
      sessions.value = []
    }
  }

  async function createSession(workspacePath: string): Promise<number> {
    try {
      const result = await ChatCreateSession(workspacePath)
      const data = JSON.parse(result)
      if (data.error) {
        console.error('Failed to create session:', data.error)
        return 0
      }
      const id = data.id || 0
      if (id) {
        currentSessionId.value = id
        await loadSessions(workspacePath)
      }
      return id
    } catch (err) {
      console.error('Failed to create session:', err)
      return 0
    }
  }

  async function loadHistory(sessionId: number): Promise<ChatMessageRecord[]> {
    if (!sessionId) return []
    try {
      const result = await ChatGetHistory(sessionId)
      const data = JSON.parse(result)
      if (data.error) {
        console.error('Failed to load history:', data.error)
        return []
      }
      return Array.isArray(data) ? data : []
    } catch (err) {
      console.error('Failed to load history:', err)
      return []
    }
  }

  async function deleteSession(sessionId: number, workspacePath: string) {
    if (!sessionId) return
    try {
      await ChatDeleteSession(sessionId)
      if (currentSessionId.value === sessionId) {
        currentSessionId.value = 0
      }
      await loadSessions(workspacePath)
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  function switchSession(sessionId: number) {
    currentSessionId.value = sessionId
  }

  return {
    sessions,
    currentSessionId,
    loadSessions,
    createSession,
    loadHistory,
    deleteSession,
    switchSession,
  }
}
