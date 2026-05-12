import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatHistory } from '../useChatHistory'

const mockSessions = [
  { id: 1, title: 'Test Session', workspacePath: '/test', createdAt: '2026-01-01', updatedAt: '2026-01-02' }
]

const mockMessages = [
  { id: 1, sessionId: 1, role: 'user', content: 'hello', createdAt: '2026-01-01' }
]

const mocks = vi.hoisted(() => ({
  ChatCreateSession: vi.fn(),
  ChatListSessions: vi.fn(),
  ChatGetHistory: vi.fn(),
  ChatDeleteSession: vi.fn(),
}))

vi.mock('../../../wailsjs/go/main/App', () => mocks)

const { ChatCreateSession, ChatListSessions, ChatGetHistory, ChatDeleteSession } = mocks

describe('useChatHistory', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
    // Reset module-level state
    const { currentSessionId, loadSessions } = useChatHistory()
    currentSessionId.value = 0
    loadSessions('')
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('loadSessions', () => {
    it('calls ChatListSessions, parses JSON, and sets sessions', async () => {
      vi.mocked(ChatListSessions).mockResolvedValue(JSON.stringify(mockSessions))

      const { sessions, loadSessions } = useChatHistory()
      await loadSessions('/test')

      expect(ChatListSessions).toHaveBeenCalledWith('/test')
      expect(sessions.value).toEqual(mockSessions)
    })

    it('sets sessions to empty array when workspacePath is empty', async () => {
      const { sessions, loadSessions } = useChatHistory()
      await loadSessions('')

      expect(ChatListSessions).not.toHaveBeenCalled()
      expect(sessions.value).toEqual([])
    })

    it('sets sessions to empty array when ChatListSessions returns error JSON', async () => {
      vi.mocked(ChatListSessions).mockResolvedValue(JSON.stringify({ error: 'db error' }))

      const { sessions, loadSessions } = useChatHistory()
      await loadSessions('/test')

      expect(sessions.value).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load sessions:', 'db error')
    })

    it('sets sessions to empty array on JSON parse error', async () => {
      vi.mocked(ChatListSessions).mockResolvedValue('invalid json')

      const { sessions, loadSessions } = useChatHistory()
      await loadSessions('/test')

      expect(sessions.value).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('createSession', () => {
    it('calls ChatCreateSession, sets currentSessionId, and reloads sessions', async () => {
      vi.mocked(ChatCreateSession).mockResolvedValue(JSON.stringify({ id: 2 }))
      vi.mocked(ChatListSessions).mockResolvedValue(JSON.stringify(mockSessions))

      const { currentSessionId, createSession } = useChatHistory()
      const result = await createSession('/test')

      expect(ChatCreateSession).toHaveBeenCalledWith('/test')
      expect(result).toBe(2)
      expect(currentSessionId.value).toBe(2)
      expect(ChatListSessions).toHaveBeenCalledWith('/test')
    })

    it('returns 0 on error JSON response', async () => {
      vi.mocked(ChatCreateSession).mockResolvedValue(JSON.stringify({ error: 'create failed' }))

      const { currentSessionId, createSession } = useChatHistory()
      const result = await createSession('/test')

      expect(result).toBe(0)
      expect(currentSessionId.value).toBe(0)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create session:', 'create failed')
    })

    it('returns 0 on exception', async () => {
      vi.mocked(ChatCreateSession).mockRejectedValue(new Error('network error'))

      const { currentSessionId, createSession } = useChatHistory()
      const result = await createSession('/test')

      expect(result).toBe(0)
      expect(currentSessionId.value).toBe(0)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create session:', expect.any(Error))
    })

    it('returns 0 and does not set currentSessionId when id is missing', async () => {
      vi.mocked(ChatCreateSession).mockResolvedValue(JSON.stringify({}))

      const { currentSessionId, createSession } = useChatHistory()
      const result = await createSession('/test')

      expect(result).toBe(0)
      expect(currentSessionId.value).toBe(0)
      expect(ChatListSessions).not.toHaveBeenCalled()
    })
  })

  describe('loadHistory', () => {
    it('calls ChatGetHistory and returns parsed messages', async () => {
      vi.mocked(ChatGetHistory).mockResolvedValue(JSON.stringify(mockMessages))

      const { loadHistory } = useChatHistory()
      const result = await loadHistory(1)

      expect(ChatGetHistory).toHaveBeenCalledWith(1)
      expect(result).toEqual(mockMessages)
    })

    it('returns empty array when sessionId is 0', async () => {
      const { loadHistory } = useChatHistory()
      const result = await loadHistory(0)

      expect(ChatGetHistory).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('returns empty array on error JSON response', async () => {
      vi.mocked(ChatGetHistory).mockResolvedValue(JSON.stringify({ error: 'not found' }))

      const { loadHistory } = useChatHistory()
      const result = await loadHistory(1)

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load history:', 'not found')
    })

    it('returns empty array on exception', async () => {
      vi.mocked(ChatGetHistory).mockRejectedValue(new Error('network error'))

      const { loadHistory } = useChatHistory()
      const result = await loadHistory(1)

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load history:', expect.any(Error))
    })
  })

  describe('deleteSession', () => {
    it('calls ChatDeleteSession and reloads sessions', async () => {
      vi.mocked(ChatDeleteSession).mockResolvedValue(undefined)
      vi.mocked(ChatListSessions).mockResolvedValue(JSON.stringify(mockSessions))

      const { deleteSession } = useChatHistory()
      await deleteSession(1, '/test')

      expect(ChatDeleteSession).toHaveBeenCalledWith(1)
      expect(ChatListSessions).toHaveBeenCalledWith('/test')
    })

    it('clears currentSessionId when deleting current session', async () => {
      vi.mocked(ChatCreateSession).mockResolvedValue(JSON.stringify({ id: 1 }))
      vi.mocked(ChatListSessions).mockResolvedValue(JSON.stringify(mockSessions))
      vi.mocked(ChatDeleteSession).mockResolvedValue(undefined)

      const { currentSessionId, createSession, deleteSession } = useChatHistory()
      await createSession('/test')
      expect(currentSessionId.value).toBe(1)

      await deleteSession(1, '/test')
      expect(currentSessionId.value).toBe(0)
    })

    it('does not clear currentSessionId when deleting non-current session', async () => {
      vi.mocked(ChatCreateSession).mockResolvedValue(JSON.stringify({ id: 1 }))
      vi.mocked(ChatListSessions).mockResolvedValue(JSON.stringify(mockSessions))
      vi.mocked(ChatDeleteSession).mockResolvedValue(undefined)

      const { currentSessionId, createSession, deleteSession } = useChatHistory()
      await createSession('/test')
      expect(currentSessionId.value).toBe(1)

      await deleteSession(2, '/test')
      expect(currentSessionId.value).toBe(1)
    })

    it('does nothing when sessionId is 0', async () => {
      const { deleteSession } = useChatHistory()
      await deleteSession(0, '/test')

      expect(ChatDeleteSession).not.toHaveBeenCalled()
    })

    it('logs error on exception', async () => {
      vi.mocked(ChatDeleteSession).mockRejectedValue(new Error('delete failed'))

      const { deleteSession } = useChatHistory()
      await deleteSession(1, '/test')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete session:', expect.any(Error))
    })
  })

  describe('switchSession', () => {
    it('sets currentSessionId', () => {
      const { currentSessionId, switchSession } = useChatHistory()
      switchSession(5)

      expect(currentSessionId.value).toBe(5)
    })
  })
})
