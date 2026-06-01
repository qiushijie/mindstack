import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openAIChatPanel, sendChatMessage, mockWailsRuntime } from '../helpers/chat'

test.describe('AI Chat History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockWailsRuntime(page)
    await openAIChatPanel(page)
  })

  test('should open history view', async ({ page }) => {
    const historyBtn = page.locator('.ai-chat-panel .history-btn')
    await historyBtn.click()
    await page.waitForTimeout(200)

    await expect(page.locator('.ai-chat-panel .history-view')).toBeVisible()
    await expect(page.locator('.ai-chat-panel .chat-title')).toContainText('Chat History')
  })

  test('should show empty sessions state', async ({ page }) => {
    const historyBtn = page.locator('.ai-chat-panel .history-btn')
    await historyBtn.click()
    await page.waitForTimeout(200)

    await expect(page.locator('.ai-chat-panel .history-empty')).toBeVisible()
    await expect(page.locator('.ai-chat-panel .history-empty')).toContainText('No sessions')
  })

  test('should show new chat button in history', async ({ page }) => {
    const historyBtn = page.locator('.ai-chat-panel .history-btn')
    await historyBtn.click()
    await page.waitForTimeout(200)

    const newBtn = page.locator('.ai-chat-panel .history-new-btn')
    await expect(newBtn).toBeVisible()
    await expect(newBtn).toContainText('New Chat')
  })

  test('should create new chat from history view', async ({ page }) => {
    // Send a message first
    await sendChatMessage(page, 'Hello')
    await page.waitForTimeout(300)

    // Open history
    await page.locator('.ai-chat-panel .history-btn').click()
    await page.waitForTimeout(200)

    // Click new chat
    await page.locator('.ai-chat-panel .history-new-btn').click()
    await page.waitForTimeout(200)

    // Should return to chat view with empty messages
    await expect(page.locator('.ai-chat-panel .message-area')).toBeVisible()
    const messages = page.locator('.ai-chat-panel .message')
    expect(await messages.count()).toBe(0)
  })

  test('should navigate back from history view', async ({ page }) => {
    const historyBtn = page.locator('.ai-chat-panel .history-btn')
    await historyBtn.click()
    await page.waitForTimeout(200)

    const backBtn = page.locator('.ai-chat-panel .back-btn')
    await backBtn.click()
    await page.waitForTimeout(200)

    await expect(page.locator('.ai-chat-panel .history-view')).toBeHidden()
    await expect(page.locator('.ai-chat-panel .chat-title')).toContainText('AI Assistant')
  })
})
