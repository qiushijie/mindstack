import { Page } from '@playwright/test'

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('#app', { state: 'attached' })
  await page.waitForSelector('.cm-editor', { state: 'visible', timeout: 15000 })
  // Wails maintains a persistent WebSocket connection, so networkidle never resolves.
  // Use 'load' instead, which fires when the initial page is fully loaded.
  await page.waitForLoadState('load')

  // wails dev (Vite HMR): Wails runtime initializes asynchronously.
  // Wait for locale to be loaded (retry mechanism in App.vue sets
  // window.__localeReady when the Wails runtime connects and settings load).
  await page.waitForFunction(() => (window as any).__localeReady === true, { timeout: 20000 })

  // Wails Go backend is unavailable when Playwright connects to the Vite dev
  // server directly, so LoadConfig() never loads the seed config (locale: zh).
  // Set Chinese locale so all locale-dependent test assertions pass.
  await page.evaluate(() => {
    ;(window as any).__setLocale?.('zh')
  })
  await page.waitForTimeout(100)
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
