import { Page } from '@playwright/test'

export function getAIBtn(page: Page) {
  return page.locator('.floating-actions').first().locator('.floating-btn[title="AI Assistant"]')
}

export async function mockWailsRuntime(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as any).runtime = {
      EventsOnMultiple: () => () => {},
      EventsOff: () => {},
      LogPrint: () => {},
      LogTrace: () => {},
      LogDebug: () => {},
      LogInfo: () => {},
      LogWarning: () => {},
      LogError: () => {},
      LogFatal: () => {},
    }
  })
}

export async function openAIChatPanel(page: Page): Promise<void> {
  await getAIBtn(page).click({ force: true })
  await page.waitForTimeout(300)
}

export async function closeAIChatPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__toggleAIChat?.()
  })
  await page.waitForTimeout(500)
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.locator('.ai-chat-panel .chat-input')
  await input.fill(text)
  const sendBtn = page.locator('.ai-chat-panel .send-btn')
  await sendBtn.click({ force: true })
  await page.waitForTimeout(300)
}
