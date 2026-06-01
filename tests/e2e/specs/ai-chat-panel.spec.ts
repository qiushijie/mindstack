import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openAIChatPanel, mockWailsRuntime } from '../helpers/chat'

test.describe('AI Chat Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockWailsRuntime(page)
  })

  test('should open chat panel', async ({ page }) => {
    await openAIChatPanel(page)
    await expect(page.locator('.ai-chat-panel')).toBeVisible()
  })

  test('should show chat title', async ({ page }) => {
    await openAIChatPanel(page)
    await expect(page.locator('.ai-chat-panel .chat-title')).toContainText('AI Assistant')
  })

  test('should display input placeholder', async ({ page }) => {
    await openAIChatPanel(page)
    const input = page.locator('.ai-chat-panel .chat-input')
    await expect(input).toBeVisible()
    const placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()
  })

  test('should show send button initially', async ({ page }) => {
    await openAIChatPanel(page)
    const sendBtn = page.locator('.ai-chat-panel .send-btn')
    await expect(sendBtn).toBeVisible()
  })

  test('should show history button', async ({ page }) => {
    await openAIChatPanel(page)
    const historyBtn = page.locator('.ai-chat-panel .history-btn')
    await expect(historyBtn).toBeVisible()
  })

  test('should show tool button', async ({ page }) => {
    await openAIChatPanel(page)
    const toolBtn = page.locator('.ai-chat-panel .tool-btn')
    await expect(toolBtn).toBeVisible()
  })

  test('should show empty message area initially', async ({ page }) => {
    await openAIChatPanel(page)
    const messages = page.locator('.ai-chat-panel .message')
    expect(await messages.count()).toBe(0)
  })

  test('should handle text input in chat textarea', async ({ page }) => {
    await openAIChatPanel(page)
    const input = page.locator('.ai-chat-panel .chat-input')
    await input.fill('Hello AI')
    await expect(input).toHaveValue('Hello AI')
  })

  test('should not send empty message', async ({ page }) => {
    await openAIChatPanel(page)
    const input = page.locator('.ai-chat-panel .chat-input')
    await input.fill('')

    const sendBtn = page.locator('.ai-chat-panel .send-btn')
    await sendBtn.click({ force: true })
    await page.waitForTimeout(300)

    const userMessages = page.locator('.ai-chat-panel .message.user')
    expect(await userMessages.count()).toBe(0)
  })
})
