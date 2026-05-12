import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import AIChatPanel from '../AIChatPanel.vue'

// Mock Wails runtime
const mockEventsOn = vi.hoisted(() => vi.fn())
vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOff: vi.fn(),
  EventsOn: mockEventsOn,
}))

// Track progress callback from syncWorkspace for manual triggering
let onProgressCb: ((data: any) => void) | undefined

// Mock composables
const mockStreamChat = vi.fn()
const mockStreamChatWithHistory = vi.fn().mockResolvedValue(0)
vi.mock('../../composables/useLLM', () => ({
  useLLM: () => ({
    streamChat: mockStreamChat,
    streamChatWithHistory: mockStreamChatWithHistory,
    cancelStream: vi.fn(),
    loading: { value: false },
    error: { value: '' },
  }),
}))

const mockSyncWorkspace = vi.fn()
vi.mock('../../composables/useSync', () => ({
  useSync: () => ({
    syncWorkspace: mockSyncWorkspace,
    syncLoading: { value: false },
    syncError: { value: '' },
  }),
}))

const mockSearchDocs = vi.fn()
vi.mock('../../composables/useSearch', () => ({
  useSearch: () => ({
    searchDocs: mockSearchDocs,
    searchLoading: { value: false },
    searchError: { value: '' },
  }),
}))

const mockSessions = ref<Array<{ id: number; title: string; updatedAt: string }>>([])
const mockCurrentSessionId = ref(0)
const mockLoadSessions = vi.fn()
const mockCreateSession = vi.fn().mockResolvedValue(1)
const mockLoadHistory = vi.fn().mockResolvedValue([])
const mockDeleteSession = vi.fn()
const mockSwitchSession = vi.fn()

vi.mock('../../composables/useChatHistory', () => ({
  useChatHistory: () => ({
    sessions: mockSessions,
    currentSessionId: mockCurrentSessionId,
    loadSessions: mockLoadSessions,
    createSession: mockCreateSession,
    loadHistory: mockLoadHistory,
    deleteSession: mockDeleteSession,
    switchSession: mockSwitchSession,
  }),
}))

vi.mock('../../composables/useAIEdit', () => ({
  useAIEdit: () => ({
    pendingEdit: { value: null },
    isEditing: { value: false },
    getCurrentDocument: vi.fn().mockReturnValue(''),
    getSelection: vi.fn().mockReturnValue(null),
    applyEdit: vi.fn().mockReturnValue(true),
    streamDocumentEdit: vi.fn(),
    streamSelectionEdit: vi.fn(),
  }),
}))

vi.mock('../../composables/useFileTree', () => ({
  useFileTree: () => ({
    rootPath: { value: '/test/workspace' },
    selectedFilePath: { value: '' },
  }),
}))

vi.mock('../../../wailsjs/go/main/App', () => ({
  GitCheckInit: vi.fn().mockResolvedValue(true),
  GitInit: vi.fn().mockResolvedValue('{"ok":true}'),
  GitPull: vi.fn().mockResolvedValue('{"ok":true}'),
  GitAutoCommit: vi.fn().mockResolvedValue('{"ok":true,"message":"feat: auto commit"}'),
  GitPush: vi.fn().mockResolvedValue('{"ok":true}'),
}))

describe('AIChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessions.value = []
    mockCurrentSessionId.value = 0
  })

  function mountComponent() {
    return mount(AIChatPanel, {
      attachTo: document.body,
    })
  }

  describe('rendering', () => {
    it('mounts with chat header', () => {
      const wrapper = mountComponent()

      expect(wrapper.find('.chat-header').exists()).toBe(true)
      expect(wrapper.find('.chat-title').text()).toBe('AI Assistant')
      expect(wrapper.find('.close-btn').exists()).toBe(true)
    })

    it('renders message area', () => {
      const wrapper = mountComponent()

      expect(wrapper.find('.message-area').exists()).toBe(true)
      expect(wrapper.findAll('.message')).toHaveLength(0)
    })

    it('renders input area with textarea and send button', () => {
      const wrapper = mountComponent()

      expect(wrapper.find('.input-area').exists()).toBe(true)
      expect(wrapper.find('.chat-input').exists()).toBe(true)
      expect(wrapper.find('.send-btn').exists()).toBe(true)
    })

    it('shows stop button instead of send button while streaming', async () => {
      const wrapper = mountComponent()

      // Initially send button is visible
      expect(wrapper.find('.send-btn').exists()).toBe(true)
      expect(wrapper.find('.stop-btn').exists()).toBe(false)

      // Type text and send to trigger streaming
      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      // Now stop button should be visible
      expect(wrapper.find('.stop-btn').exists()).toBe(true)
      expect(wrapper.find('.send-btn').exists()).toBe(false)
    })

    it('shows tool button in input area', () => {
      const wrapper = mountComponent()

      expect(wrapper.find('.tool-btn').exists()).toBe(true)
    })

    it('does not show tool menu by default', () => {
      const wrapper = mountComponent()

      expect(wrapper.find('.tool-menu').exists()).toBe(false)
    })
  })

  describe('close', () => {
    it('emits close when clicking close button', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.close-btn').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })
  })

  describe('sending messages', () => {
    it('sends a user message and creates assistant placeholder', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      const messages = wrapper.findAll('.message')
      expect(messages).toHaveLength(2)
      expect(messages[0].classes()).toContain('user')
      expect(messages[1].classes()).toContain('assistant')
    })

    it('clears input after sending', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect((wrapper.find('.chat-input').element as HTMLTextAreaElement).value).toBe('')
    })

    it('calls streamChatWithHistory with correct data', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('test question')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(mockStreamChatWithHistory).toHaveBeenCalledOnce()
      const [req] = mockStreamChatWithHistory.mock.calls[0]
      expect(req.workspacePath).toBe('/test/workspace')
      expect(req.userMessage).toBe('test question')
      expect(req.messages).toHaveLength(1)
      expect(req.messages[0]).toEqual({ role: 'user', content: 'test question' })
    })

    it('does not send empty message', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(mockStreamChatWithHistory).not.toHaveBeenCalled()
      expect(wrapper.findAll('.message')).toHaveLength(0)
    })

    it('sends message on Enter key without shift', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.chat-input').trigger('keydown', { key: 'Enter', shiftKey: false })
      await nextTick()

      expect(mockStreamChatWithHistory).toHaveBeenCalled()
    })

    it('does not send message on Shift+Enter', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.chat-input').trigger('keydown', { key: 'Enter', shiftKey: true })
      await nextTick()

      expect(mockStreamChatWithHistory).not.toHaveBeenCalled()
    })
  })

  describe('tool menu', () => {
    it('toggles tool menu on button click', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.tool-menu').exists()).toBe(true)

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.tool-menu').exists()).toBe(false)
    })

    it('shows tool menu items', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()

      const items = wrapper.findAll('.tool-menu-item')
      expect(items).toHaveLength(3)
      expect(items[0].text()).toContain('Search')
      expect(items[1].text()).toContain('Git Sync')
      expect(items[2].text()).toContain('Sync')
    })

    it('selects search tool and focuses input', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()

      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()

      // Menu should close
      expect(wrapper.find('.tool-menu').exists()).toBe(false)
      // Tool button should be active
      expect(wrapper.find('.tool-btn').classes()).toContain('active')
      // Placeholder should change
      expect((wrapper.find('.chat-input').element as HTMLTextAreaElement).placeholder).toBe('Enter tags to search...')
    })

    it('triggers sync when sync tool is selected', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()

      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      expect(mockSyncWorkspace).toHaveBeenCalledOnce()
      // Should show user message "/sync" and assistant placeholder
      const messages = wrapper.findAll('.message')
      expect(messages).toHaveLength(2)
      expect(messages[0].find('.bubble').text()).toBe('/sync')
    })

    it('clears tool selection when tool button is clicked with active selection', async () => {
      const wrapper = mountComponent()

      // Select search tool
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()

      expect(wrapper.find('.tool-btn').classes()).toContain('active')

      // Click tool button again to clear
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.tool-btn').classes()).not.toContain('active')
    })
  })

  describe('search', () => {
    it('runs search when search tool is selected and message sent', async () => {
      mockSearchDocs.mockResolvedValue({
        tag: 'golang',
        total: 2,
        items: [
          { path: '/docs/go.md', title: 'Go Notes' },
          { path: '/docs/go-advanced.md', title: 'Go Advanced' },
        ],
      })

      const wrapper = mountComponent()

      // Select search tool
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()

      // Type search query and send
      await wrapper.find('.chat-input').setValue('golang')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(mockSearchDocs).toHaveBeenCalledWith('golang')

      // Wait for search promise to resolve
      await vi.waitFor(() => {
        expect(wrapper.findAll('.message')).toHaveLength(2)
      })

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Found 2 document(s)')

      // Should render doc links
      const links = wrapper.findAll('.doc-link')
      expect(links).toHaveLength(2)
      expect(links[0].text()).toBe('Go Notes')
      expect(links[1].text()).toBe('Go Advanced')
    })

    it('handles empty search results', async () => {
      mockSearchDocs.mockResolvedValue({
        tag: 'nonexistent',
        total: 0,
        items: [],
      })

      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()

      await wrapper.find('.chat-input').setValue('nonexistent')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.findAll('.message')).toHaveLength(2)
      })

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('No documents found')
    })

    it('handles search error', async () => {
      mockSearchDocs.mockRejectedValue(new Error('search failed'))

      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()

      await wrapper.find('.chat-input').setValue('test')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      await vi.waitFor(() => {
        const messages = wrapper.findAll('.message')
        const text = messages[1].find('.bubble').text()
        return text.includes('Error')
      })

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Error')
    })
  })

  describe('git sync', () => {
    it('runs git push when git tool sends push command', async () => {
      const { GitPush, GitCheckInit } = await import('../../../wailsjs/go/main/App')
      vi.mocked(GitCheckInit).mockResolvedValue(true)
      vi.mocked(GitPush).mockResolvedValue('{"ok":true}')

      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[1].trigger('click')
      await nextTick()

      expect((wrapper.find('.chat-input').element as HTMLTextAreaElement).placeholder).toBe('Enter "push" or "pull"...')

      await wrapper.find('.chat-input').setValue('push')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.findAll('.message')).toHaveLength(2)
      })

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Push completed successfully')
    })

    it('runs git pull when git tool sends pull command', async () => {
      const { GitPull, GitCheckInit } = await import('../../../wailsjs/go/main/App')
      vi.mocked(GitCheckInit).mockResolvedValue(true)
      vi.mocked(GitPull).mockResolvedValue('{"ok":true}')

      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[1].trigger('click')
      await nextTick()

      await wrapper.find('.chat-input').setValue('pull')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.findAll('.message')).toHaveLength(2)
      })

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Pull completed successfully')
    })

    it('shows error for invalid git action', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[1].trigger('click')
      await nextTick()

      await wrapper.find('.chat-input').setValue('invalid')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      const messages = wrapper.findAll('.message')
      expect(messages).toHaveLength(2)
      const assistantBubble = messages[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Invalid action')
    })
  })

  describe('sync progress', () => {
    beforeEach(() => {
      onProgressCb = undefined
      // Capture the onProgress callback so tests can simulate progress
      mockSyncWorkspace.mockImplementation((onProgress: (data: any) => void) => {
        onProgressCb = onProgress
      })
    })

    it('updates message with sync progress', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      // Simulate a sync progress event
      onProgressCb!({ file: 'test.md', current: 1, total: 3, status: 'processing', phase: 'meta' })

      await nextTick()

      const messages = wrapper.findAll('.message')
      const lastMsg = messages[messages.length - 1]
      expect(lastMsg.find('.bubble').text()).toContain('test.md')
    })

    it('shows completion message when sync finishes', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      onProgressCb!({ file: '', current: 3, total: 3, status: 'complete', phase: 'relation' })

      await nextTick()

      const messages = wrapper.findAll('.message')
      const lastMsg = messages[messages.length - 1]
      expect(lastMsg.find('.bubble').text()).toContain('Sync complete')
    })

    it('shows no files message when sync finds nothing', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      onProgressCb!({ file: '', current: 0, total: 0, status: 'complete', phase: 'meta' })

      await nextTick()

      const messages = wrapper.findAll('.message')
      const lastMsg = messages[messages.length - 1]
      expect(lastMsg.find('.bubble').text()).toContain('No markdown files found')
    })
  })

  describe('openFile', () => {
    it('emits openFile when clicking a doc link', async () => {
      mockSearchDocs.mockResolvedValue({
        tag: 'doc',
        total: 1,
        items: [{ path: '/docs/manual.md', title: 'User Manual' }],
      })

      const wrapper = mountComponent()

      // Run a search first to get doc links
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()
      await wrapper.find('.chat-input').setValue('doc')
      await wrapper.find('.send-btn').trigger('click')

      await vi.waitFor(() => {
        expect(wrapper.findAll('.doc-link')).toHaveLength(1)
      })

      await wrapper.find('.doc-link').trigger('click')

      expect(wrapper.emitted('openFile')).toHaveLength(1)
      expect(wrapper.emitted('openFile')![0]).toEqual(['/docs/manual.md'])
    })
  })

  describe('history view', () => {
    it('shows history button in chat header', () => {
      const wrapper = mountComponent()

      expect(wrapper.find('.history-btn').exists()).toBe(true)
    })

    it('switches to history view when clicking history button', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.history-view').exists()).toBe(true)
      expect(wrapper.find('.message-area').exists()).toBe(false)
      expect(wrapper.find('.chat-title').text()).toBe('Chat History')
    })

    it('renders session list in history view', async () => {
      mockSessions.value = [
        { id: 1, title: 'Session One', updatedAt: '2026-05-01T10:00:00Z' },
        { id: 2, title: 'Session Two', updatedAt: '2026-05-02T12:00:00Z' },
      ]

      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      const items = wrapper.findAll('.history-item')
      expect(items).toHaveLength(2)
      expect(items[0].find('.history-item-title').text()).toBe('Session One')
      expect(items[1].find('.history-item-title').text()).toBe('Session Two')
    })

    it('highlights current session in history view', async () => {
      mockSessions.value = [
        { id: 1, title: 'Session One', updatedAt: '2026-05-01T10:00:00Z' },
        { id: 2, title: 'Session Two', updatedAt: '2026-05-02T12:00:00Z' },
      ]
      mockCurrentSessionId.value = 1

      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      const items = wrapper.findAll('.history-item')
      expect(items[0].classes()).toContain('active')
      expect(items[1].classes()).not.toContain('active')
    })

    it('switches session and returns to chat when clicking a session', async () => {
      mockSessions.value = [
        { id: 1, title: 'Session One', updatedAt: '2026-05-01T10:00:00Z' },
        { id: 2, title: 'Session Two', updatedAt: '2026-05-02T12:00:00Z' },
      ]

      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      await wrapper.findAll('.history-item')[1].trigger('click')
      await nextTick()

      expect(mockSwitchSession).toHaveBeenCalledWith(2)
      expect(wrapper.find('.history-view').exists()).toBe(false)
      expect(wrapper.find('.message-area').exists()).toBe(true)
    })

    it('deletes session when clicking delete button', async () => {
      mockSessions.value = [
        { id: 1, title: 'Session One', updatedAt: '2026-05-01T10:00:00Z' },
        { id: 2, title: 'Session Two', updatedAt: '2026-05-02T12:00:00Z' },
      ]

      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      await wrapper.findAll('.history-delete-btn')[0].trigger('click')
      await nextTick()

      expect(mockDeleteSession).toHaveBeenCalledWith(1, '/test/workspace')
      expect(mockSwitchSession).not.toHaveBeenCalled()
    })

    it('creates new session and returns to chat', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      await wrapper.find('.history-new-btn').trigger('click')
      await nextTick()

      expect(mockCreateSession).toHaveBeenCalledWith('/test/workspace')
      expect(wrapper.find('.history-view').exists()).toBe(false)
      expect(wrapper.find('.message-area').exists()).toBe(true)
    })

    it('returns to chat view when clicking back button', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.history-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.history-view').exists()).toBe(true)

      await wrapper.find('.back-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.history-view').exists()).toBe(false)
      expect(wrapper.find('.message-area').exists()).toBe(true)
      expect(wrapper.find('.chat-title').text()).toBe('AI Assistant')
    })
  })
})
