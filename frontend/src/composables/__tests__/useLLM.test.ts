import { describe, it, expect, beforeEach, vi } from 'vitest'

// Capture the listener registered via EventsOn so tests can emit events
let chunkListener: ((data: string) => void) | null = null

vi.mock('../../../wailsjs/go/main/App', () => ({
  Chat: vi.fn(),
  StreamChat: vi.fn(),
  GetActiveModelInfo: vi.fn(),
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn((_eventName: string, callback: (data: string) => void) => {
    chunkListener = callback
  }),
  EventsOff: vi.fn(),
}))

import { Chat, StreamChat, GetActiveModelInfo } from '../../../wailsjs/go/main/App'
import { EventsOff } from '../../../wailsjs/runtime/runtime'
import { useLLM } from '../useLLM'

beforeEach(() => {
  chunkListener = null
  vi.mocked(Chat).mockReset()
  vi.mocked(StreamChat).mockReset()
  vi.mocked(GetActiveModelInfo).mockReset()
  vi.mocked(EventsOff).mockReset()
})

describe('useLLM', () => {
  describe('chat', () => {
    it('returns content on successful response', async () => {
      vi.mocked(Chat).mockResolvedValue(JSON.stringify({ content: 'Hello from LLM' }))

      const { chat, loading, error } = useLLM()
      const result = await chat([{ role: 'user', content: 'Hi' }])

      expect(result).toBe('Hello from LLM')
      expect(error.value).toBe('')
      expect(loading.value).toBe(false)
      expect(Chat).toHaveBeenCalledWith(JSON.stringify([{ role: 'user', content: 'Hi' }]))
    })

    it('sets loading during the call and clears after', async () => {
      let resolveChat!: (value: string) => void
      vi.mocked(Chat).mockReturnValue(new Promise<string>((resolve) => { resolveChat = resolve }))

      const { chat, loading } = useLLM()
      const promise = chat([{ role: 'user', content: 'Hi' }])

      expect(loading.value).toBe(true)

      resolveChat(JSON.stringify({ content: 'done' }))
      await promise

      expect(loading.value).toBe(false)
    })

    it('returns empty string and sets error when response contains error', async () => {
      vi.mocked(Chat).mockResolvedValue(JSON.stringify({ error: 'Model not configured' }))

      const { chat, error } = useLLM()
      const result = await chat([{ role: 'user', content: 'Hi' }])

      expect(result).toBe('')
      expect(error.value).toBe('Model not configured')
    })

    it('returns empty string and sets error when Chat throws', async () => {
      vi.mocked(Chat).mockRejectedValue(new Error('Network failure'))

      const { chat, error } = useLLM()
      const result = await chat([{ role: 'user', content: 'Hi' }])

      expect(result).toBe('')
      expect(error.value).toBe('Network failure')
    })

    it('returns empty content as empty string', async () => {
      vi.mocked(Chat).mockResolvedValue(JSON.stringify({ content: '' }))

      const { chat } = useLLM()
      const result = await chat([{ role: 'user', content: 'Hi' }])

      expect(result).toBe('')
    })

    it('returns empty string when response has no content field', async () => {
      vi.mocked(Chat).mockResolvedValue(JSON.stringify({}))

      const { chat } = useLLM()
      const result = await chat([{ role: 'user', content: 'Hi' }])

      expect(result).toBe('')
    })

    it('clears previous error on new call', async () => {
      vi.mocked(Chat)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(JSON.stringify({ content: 'ok' }))

      const { chat, error } = useLLM()
      await chat([{ role: 'user', content: 'Hi' }])
      expect(error.value).toBe('fail')

      await chat([{ role: 'user', content: 'Hi again' }])
      expect(error.value).toBe('')
    })
  })

  describe('streamChat', () => {
    it('calls onChunk for each content chunk', () => {
      vi.mocked(StreamChat).mockResolvedValue(undefined)

      const { streamChat, loading } = useLLM()
      const onChunk = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      streamChat([{ role: 'user', content: 'Hi' }], onChunk, onDone, onError)

      expect(loading.value).toBe(true)
      expect(chunkListener).not.toBeNull()

      // Simulate chunks arriving
      chunkListener!(JSON.stringify({ content: 'Hello' }))
      chunkListener!(JSON.stringify({ content: ' world' }))

      expect(onChunk).toHaveBeenCalledWith('Hello')
      expect(onChunk).toHaveBeenCalledWith(' world')
      expect(loading.value).toBe(true)
    })

    it('calls onDone and cleans up when chunk.done is true', () => {
      vi.mocked(StreamChat).mockResolvedValue(undefined)

      const { streamChat, loading } = useLLM()
      const onChunk = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      streamChat([], onChunk, onDone, onError)

      chunkListener!(JSON.stringify({ content: 'partial' }))
      chunkListener!(JSON.stringify({ done: true }))

      expect(onChunk).toHaveBeenCalledWith('partial')
      expect(onDone).toHaveBeenCalled()
      expect(loading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('llm:chunk')
    })

    it('calls onError and cleans up when chunk contains error', () => {
      vi.mocked(StreamChat).mockResolvedValue(undefined)

      const { streamChat, loading, error } = useLLM()
      const onChunk = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      streamChat([], onChunk, onDone, onError)

      chunkListener!(JSON.stringify({ error: 'Rate limited' }))

      expect(onError).toHaveBeenCalledWith('Rate limited')
      expect(error.value).toBe('Rate limited')
      expect(loading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('llm:chunk')
    })

    it('ignores malformed JSON chunks', () => {
      vi.mocked(StreamChat).mockResolvedValue(undefined)

      const { streamChat } = useLLM()
      const onChunk = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      streamChat([], onChunk, onDone, onError)

      // Should not throw, just silently ignore
      chunkListener!('not-valid-json')

      expect(onChunk).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
    })

    it('calls onError when StreamChat promise rejects', async () => {
      vi.mocked(StreamChat).mockRejectedValue(new Error('Connection lost'))

      const { streamChat, loading, error } = useLLM()
      const onChunk = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      streamChat([], onChunk, onDone, onError)

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError).toHaveBeenCalledWith('Connection lost')
      expect(error.value).toBe('Connection lost')
      expect(loading.value).toBe(false)
    })

    it('removes previous listener when called again', () => {
      vi.mocked(StreamChat).mockResolvedValue(undefined)

      const { streamChat } = useLLM()
      const onDone1 = vi.fn()
      const onDone2 = vi.fn()

      streamChat([], vi.fn(), onDone1, vi.fn())

      // Starting a second stream should clean up the first
      streamChat([], vi.fn(), onDone2, vi.fn())

      // Send done chunk - should only trigger onDone2
      chunkListener!(JSON.stringify({ done: true }))

      expect(onDone1).not.toHaveBeenCalled()
      expect(onDone2).toHaveBeenCalled()
    })

    it('handles StreamChat rejection with non-Error object', async () => {
      vi.mocked(StreamChat).mockRejectedValue('raw string')

      const { streamChat, error } = useLLM()
      const onError = vi.fn()

      streamChat([], vi.fn(), vi.fn(), onError)

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(error.value).toBe('Stream failed')
    })
  })

  describe('getActiveModel', () => {
    it('returns ModelInfo when model is configured', async () => {
      vi.mocked(GetActiveModelInfo).mockResolvedValue(
        JSON.stringify({ configured: true, id: 'openai', model: 'gpt-4' }),
      )

      const { getActiveModel } = useLLM()
      const result = await getActiveModel()

      expect(result).toEqual({ configured: true, id: 'openai', model: 'gpt-4' })
    })

    it('returns unconfigured ModelInfo when not set up', async () => {
      vi.mocked(GetActiveModelInfo).mockResolvedValue(
        JSON.stringify({ configured: false }),
      )

      const { getActiveModel } = useLLM()
      const result = await getActiveModel()

      expect(result).toEqual({ configured: false })
    })

    it('returns default ModelInfo on error', async () => {
      vi.mocked(GetActiveModelInfo).mockRejectedValue(new Error('fail'))

      const { getActiveModel } = useLLM()
      const result = await getActiveModel()

      expect(result).toEqual({ configured: false })
    })
  })
})
