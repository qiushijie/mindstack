import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import AIChatPanel from '../AIChatPanel.vue'

// Mock Wails runtime
vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOff: vi.fn(),
  EventsOn: vi.fn(),
}))

// Mock composables
const mockStreamChat = vi.fn()
vi.mock('../../composables/useLLM', () => ({
  useLLM: () => ({
    streamChat: mockStreamChat,
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

const mockAckQuery = vi.fn()
vi.mock('../../composables/useAck', () => ({
  useAck: () => ({
    ackQuery: mockAckQuery,
    ackLoading: { value: false },
    ackError: { value: '' },
  }),
}))

describe('AIChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    it('calls streamChat with correct messages', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('test question')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(mockStreamChat).toHaveBeenCalledOnce()
      const [chatMessages] = mockStreamChat.mock.calls[0]
      // System prompt + user message
      expect(chatMessages).toHaveLength(2)
      expect(chatMessages[0]).toEqual({ role: 'system', content: 'You are a helpful AI assistant. Answer concisely and clearly.' })
      expect(chatMessages[1]).toEqual({ role: 'user', content: 'test question' })
    })

    it('does not send empty message', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(mockStreamChat).not.toHaveBeenCalled()
      expect(wrapper.findAll('.message')).toHaveLength(0)
    })

    it('sends message on Enter key without shift', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.chat-input').trigger('keydown', { key: 'Enter', shiftKey: false })
      await nextTick()

      expect(mockStreamChat).toHaveBeenCalledOnce()
    })

    it('does not send message on Shift+Enter', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.chat-input').trigger('keydown', { key: 'Enter', shiftKey: true })
      await nextTick()

      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    it('streams response chunks to assistant message', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      // Extract onChunk callback
      const onChunk = mockStreamChat.mock.calls[0][1]
      onChunk('Hello ')
      onChunk('world!')
      await nextTick()

      const assistantBubble = wrapper.findAll('.bubble')[1]
      expect(assistantBubble.text()).toContain('Hello world!')
    })

    it('shows streaming cursor while response is in progress', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      // Should show cursor while streaming
      expect(wrapper.find('.cursor').exists()).toBe(true)

      // Finish the stream
      const onDone = mockStreamChat.mock.calls[0][2]
      onDone()
      await nextTick()

      // Cursor should be gone
      expect(wrapper.find('.cursor').exists()).toBe(false)
    })

    it('handles stream error', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      const onError = mockStreamChat.mock.calls[0][3]
      onError('Something went wrong')
      await nextTick()

      const assistantBubble = wrapper.findAll('.bubble')[1]
      expect(assistantBubble.text()).toContain('Error: Something went wrong')
    })

    it('shows AI label for assistant messages', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      const messages = wrapper.findAll('.message')
      expect(messages[0].find('.ai-label').exists()).toBe(false)
      expect(messages[1].find('.ai-label').exists()).toBe(true)
      expect(messages[1].find('.ai-label').text()).toBe('AI')
    })
  })

  describe('stop streaming', () => {
    it('stops streaming when stop button is clicked', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.stop-btn').exists()).toBe(true)
      expect(wrapper.find('.cursor').exists()).toBe(true)

      await wrapper.find('.stop-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.cursor').exists()).toBe(false)
      expect(wrapper.find('.send-btn').exists()).toBe(true)
    })
  })

  describe('tool menu', () => {
    it('toggles tool menu when tool button is clicked', async () => {
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
      expect(items[1].text()).toContain('Ask')
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

  describe('ack', () => {
    it('renders snippets and overall summary when ack returns results', async () => {
      mockAckQuery.mockResolvedValue({
        query: 'retry policy',
        tags: ['api', 'retry'],
        summary: 'API retry uses exponential backoff with 3 attempts.',
        snippets: [
          {
            path: '/kb/api.md',
            startLine: 3,
            endLine: 5,
            content: 'Retry uses exponential backoff.',
            score: 0.9,
          },
        ],
      })

      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[1].trigger('click')
      await nextTick()

      expect((wrapper.find('.chat-input').element as HTMLTextAreaElement).placeholder).toBe('Ask a question...')

      await wrapper.find('.chat-input').setValue('retry policy')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      expect(mockAckQuery).toHaveBeenCalledWith('retry policy')

      await vi.waitFor(() => {
        expect(wrapper.findAll('.snippet-card')).toHaveLength(1)
      })

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('API retry uses exponential backoff with 3 attempts.')

      const card = wrapper.find('.snippet-card')
      expect(card.find('.snippet-link').text()).toBe('/kb/api.md:3-5')
      expect(card.find('.snippet-content').text()).toContain('exponential backoff')
    })

    it('shows empty message when no snippets are found', async () => {
      mockAckQuery.mockResolvedValue({ query: 'x', tags: [], summary: '', snippets: [] })

      const wrapper = mountComponent()
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[1].trigger('click')
      await nextTick()
      await wrapper.find('.chat-input').setValue('nothing matches')
      await wrapper.find('.send-btn').trigger('click')

      await vi.waitFor(() => {
        const txt = wrapper.findAll('.message')[1].find('.bubble').text()
        return txt.includes('No relevant snippets')
      })
    })

    it('emits openFile when clicking a snippet link', async () => {
      mockAckQuery.mockResolvedValue({
        query: 'q',
        tags: [],
        summary: 'short answer',
        snippets: [
          { path: '/kb/x.md', startLine: 1, endLine: 2, content: 'x', score: 1 },
        ],
      })

      const wrapper = mountComponent()
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[1].trigger('click')
      await nextTick()
      await wrapper.find('.chat-input').setValue('q')
      await wrapper.find('.send-btn').trigger('click')

      await vi.waitFor(() => {
        expect(wrapper.findAll('.snippet-link')).toHaveLength(1)
      })

      await wrapper.find('.snippet-link').trigger('click')
      const events = wrapper.emitted('openFile')
      expect(events).toBeTruthy()
      expect(events![0]).toEqual(['/kb/x.md'])
    })
  })

  describe('sync progress', () => {
    it('updates message with sync progress', async () => {
      const wrapper = mountComponent()

      // Trigger sync via tool menu
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      expect(mockSyncWorkspace).toHaveBeenCalledOnce()

      // Extract onProgress callback
      const onProgress = mockSyncWorkspace.mock.calls[0][0]

      onProgress({ status: 'processing', current: 1, total: 3, file: 'a.md', phase: 'meta' })
      await nextTick()

      let assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Syncing (1/3): a.md')

      onProgress({ status: 'done', current: 1, total: 3, file: 'a.md', phase: 'meta' })
      await nextTick()

      assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Synced (1/3): a.md')
    })

    it('shows completion message when sync finishes', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      const onProgress = mockSyncWorkspace.mock.calls[0][0]
      const onDone = mockSyncWorkspace.mock.calls[0][1]

      onProgress({ status: 'complete', current: 5, total: 5, file: '', phase: 'meta' })
      await nextTick()
      onProgress({ status: 'complete', current: 5, total: 5, file: '', phase: 'relation' })
      onDone()
      await nextTick()

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Sync complete.')
    })

    it('shows no files message when sync finds nothing', async () => {
      const wrapper = mountComponent()

      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[2].trigger('click')
      await nextTick()

      const onProgress = mockSyncWorkspace.mock.calls[0][0]
      const onDone = mockSyncWorkspace.mock.calls[0][1]

      onProgress({ status: 'complete', current: 0, total: 0, file: '', phase: 'meta' })
      await nextTick()
      onProgress({ status: 'complete', current: 0, total: 0, file: '', phase: 'relation' })
      onDone()
      await nextTick()

      const assistantBubble = wrapper.findAll('.message')[1].find('.bubble')
      expect(assistantBubble.text()).toContain('Sync complete.')
    })
  })

  describe('openFile', () => {
    it('emits openFile when clicking a doc link', async () => {
      mockSearchDocs.mockResolvedValue({
        tag: 'test',
        total: 1,
        items: [{ path: '/notes/test.md', title: 'Test' }],
      })

      const wrapper = mountComponent()

      // Trigger search
      await wrapper.find('.tool-btn').trigger('click')
      await nextTick()
      await wrapper.findAll('.tool-menu-item')[0].trigger('click')
      await nextTick()
      await wrapper.find('.chat-input').setValue('test')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.findAll('.doc-link')).toHaveLength(1)
      })

      await wrapper.find('.doc-link').trigger('click')

      expect(wrapper.emitted('openFile')).toHaveLength(1)
      expect(wrapper.emitted('openFile')![0]).toEqual(['/notes/test.md'])
    })
  })

  describe('cleanup', () => {
    it('stops streaming and calls EventsOff on unmount', async () => {
      const { EventsOff } = await import('../../../wailsjs/runtime/runtime')
      const wrapper = mountComponent()

      // Start streaming
      await wrapper.find('.chat-input').setValue('hello')
      await wrapper.find('.send-btn').trigger('click')
      await nextTick()

      wrapper.unmount()

      expect(EventsOff).toHaveBeenCalledWith('sync:progress')
    })
  })
})
