import { Page } from '@playwright/test'

export async function openFindPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__toggleFindPanel?.()
  })
  await page.waitForTimeout(200)
}

export async function closeFindPanel(page: Page): Promise<void> {
  const closeBtn = page.locator('.find-close')
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
    await page.waitForTimeout(200)
  }
}

export async function typeInFindPanel(page: Page, text: string): Promise<void> {
  const input = page.locator('.find-input')
  await input.fill(text)
  await page.waitForTimeout(150)
}
