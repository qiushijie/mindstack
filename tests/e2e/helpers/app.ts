import { Page } from '@playwright/test'

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('#app', { state: 'attached' })
  await page.waitForSelector('.cm-editor', { state: 'visible', timeout: 10000 })
  // Wails maintains a persistent WebSocket connection, so networkidle never resolves.
  // Use 'load' instead, which fires when the initial page is fully loaded.
  await page.waitForLoadState('load')
}

export async function resetAppState(page: Page): Promise<void> {
  await page.evaluate(() => {
    return (window as any).__resetFileTreeState?.()
  })
}

export async function navigateTo(page: Page, name: 'editor' | 'settings' | 'relations'): Promise<void> {
  await page.evaluate((n) => {
    // Exposed in DEV mode by useNavigation.ts
    ;(window as any).__navigateTo?.(n)
  }, name)
  await page.waitForTimeout(100)
}
