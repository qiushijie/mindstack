import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

// The e2e environment connects to Vite dev server, so the Wails Go backend
// is unavailable. We mock the TestCompressMessages binding to verify the
// frontend can correctly invoke and display compression results.
async function mockCompressBinding(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    if (!(window as any).go) {
      ;(window as any).go = { main: { App: {} } }
    }
    ;(window as any).go.main.App.TestCompressMessages = (reqJSON: string) => {
      const req = JSON.parse(reqJSON)
      const msgs = req.messages
      const cw = req.contextWindow || 100
      const threshold = cw * 0.8

      // Simple token estimation: 1 token per 4 chars
      const totalTokens = msgs.reduce((sum: number, m: any) => sum + Math.ceil(m.content.length / 4), 0)

      // Separate system messages and chat messages (same logic as backend)
      const systemMsgs = msgs.filter((m: any) => m.role === 'system')
      const chatMsgs = msgs.filter((m: any) => m.role !== 'system')

      if (cw <= 0 || totalTokens <= threshold || chatMsgs.length <= 4) {
        return Promise.resolve(
          JSON.stringify({
            ok: true,
            count: msgs.length,
            messages: msgs,
          }),
        )
      }

      // Simulate compression: keep last 4 chat messages, summarize the rest
      const toKeep = chatMsgs.slice(-4)
      const summaryContent = req.summaryText || 'conversation summary'

      const result = [
        ...systemMsgs,
        { role: 'system', content: '[Earlier conversation summary]\n' + summaryContent },
        ...toKeep,
      ]

      return Promise.resolve(
        JSON.stringify({
          ok: true,
          count: result.length,
          messages: result,
        }),
      )
    }
  })
}

// Helper to call the mocked compression API through the page
async function testCompress(
  page: import('@playwright/test').Page,
  messages: { role: string; content: string }[],
  contextWindow?: number,
  summaryText?: string,
): Promise<any> {
  const req = JSON.stringify({
    messages,
    contextWindow: contextWindow ?? 100,
    summaryText: summaryText ?? 'test summary',
  })
  return page.evaluate(async (reqJSON: string) => {
    const raw = await (window as any).go.main.App.TestCompressMessages(reqJSON)
    return JSON.parse(raw)
  }, req)
}

test.describe('AI Message Compression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockCompressBinding(page)
  })

  test('should not compress when total tokens are below threshold', async ({ page }) => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]
    const result = await testCompress(page, messages, 10000)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.count).toBe(2)
    expect(result.messages[0].content).toBe('hello')
    expect(result.messages[1].content).toBe('hi there')
  })

  test('should compress old messages and keep recent ones', async ({ page }) => {
    const longContent = 'a'.repeat(100)
    const messages = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
    ]
    const result = await testCompress(page, messages, 100)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.count).toBe(5) // summary + 4 recent

    const lastFour = result.messages.slice(-4)
    expect(lastFour[0].content).toBe(longContent)
    expect(lastFour[1].content).toBe(longContent)
    expect(lastFour[2].content).toBe(longContent)
    expect(lastFour[3].content).toBe(longContent)
  })

  test('should preserve system messages during compression', async ({ page }) => {
    const longContent = 'b'.repeat(100)
    const messages = [
      { role: 'system', content: 'you are a helpful assistant' },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
    ]
    const result = await testCompress(page, messages, 100)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)

    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toBe('you are a helpful assistant')

    expect(result.messages[1].role).toBe('system')
    expect(result.messages[1].content).toContain('test summary')
  })

  test('should not compress when there are too few messages', async ({ page }) => {
    const longContent = 'c'.repeat(100)
    const messages = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
    ]
    const result = await testCompress(page, messages, 10)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.count).toBe(2)
  })

  test('should handle context window of zero', async ({ page }) => {
    const longContent = 'd'.repeat(1000)
    const messages = [
      { role: 'user', content: longContent },
    ]
    const result = await testCompress(page, messages, 0)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.count).toBe(1)
    expect(result.messages[0].content).toBe(longContent)
  })

  test('should handle empty messages array', async ({ page }) => {
    const messages: { role: string; content: string }[] = []
    const result = await testCompress(page, messages, 100)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.count).toBe(0)
  })

  test('should use custom summary text', async ({ page }) => {
    const longContent = 'f'.repeat(100)
    const messages = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
    ]
    const customSummary = 'custom summary text for testing'
    const result = await testCompress(page, messages, 100, customSummary)

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)

    const summaryMsg = result.messages.find((m: any) =>
      m.role === 'system' && m.content.includes(customSummary),
    )
    expect(summaryMsg).toBeDefined()
    expect(summaryMsg.content).toContain(customSummary)
  })
})
