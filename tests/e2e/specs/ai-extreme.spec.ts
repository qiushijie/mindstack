import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

function aiBtn(page: import('@playwright/test').Page) {
  // Scope to the first .floating-actions (App.vue's, not CodeMirrorEditor's)
  return page.locator('.floating-actions').first().locator('.floating-btn[title="AI Assistant"]')
}

test.describe('AI Chat Extreme - Input Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    // Open AI chat panel
    await aiBtn(page).click({ force: true })
    await expect(page.locator('.ai-chat-panel')).toBeVisible()
  })

  test('should not send empty message', async ({ page }) => {
    const input = page.locator('.ai-chat-panel .chat-input')
    await input.fill('')

    const sendBtn = page.locator('.ai-chat-panel .send-btn')
    // Send button may be visible but should not create a message
    await sendBtn.click({ force: true })
    await page.waitForTimeout(300)

    // No user message should appear
    const userMessages = page.locator('.ai-chat-panel .message.user')
    expect(await userMessages.count()).toBe(0)
  })

  test('should handle very long input without crash', async ({ page }) => {
    const longText = 'word '.repeat(2000)
    const input = page.locator('.ai-chat-panel .chat-input')
    await input.fill(longText)
    await page.waitForTimeout(200)

    const value = await input.inputValue()
    expect(value.length).toBeGreaterThan(5000)

    // Input should still be visible and functional
    await expect(input).toBeVisible()

    // Clear should work after long input
    await input.fill('')
    await page.waitForTimeout(100)
    const afterClear = await input.inputValue()
    expect(afterClear).toBe('')
  })

  test('should handle input with only whitespace', async ({ page }) => {
    const input = page.locator('.ai-chat-panel .chat-input')
    await input.fill('   \n\n   ')

    const sendBtn = page.locator('.ai-chat-panel .send-btn')
    await sendBtn.click({ force: true })
    await page.waitForTimeout(300)

    const userMessages = page.locator('.ai-chat-panel .message.user')
    // Should not create a meaningful message from whitespace
    expect(await userMessages.count()).toBe(0)
  })
})

test.describe('AI Chat Extreme - Panel Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should open AI panel and reflect active state on button', async ({ page }) => {
    const btn = aiBtn(page)

    // Initially panel is hidden and button is not active
    await expect(page.locator('.ai-chat-panel')).toBeHidden()
    await expect(btn).not.toHaveClass(/active/)

    // Open
    await btn.click({ force: true })
    await expect(page.locator('.ai-chat-panel')).toBeVisible()
    await expect(btn).toHaveClass(/active/)
  })
})
