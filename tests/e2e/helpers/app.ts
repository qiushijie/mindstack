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

  // Wait for Wails Go bindings to be ready (injected asynchronously by the
  // Wails runtime WebSocket connection). In e2e tests that connect directly
  // to the Vite dev server, Wails runtime may not be available. Use a short
  // timeout so tests that don't need Go bindings can proceed quickly.
  try {
    await page.waitForFunction(() => !!(window as any).go?.main?.App, { timeout: 3000 })
  } catch {
    // Go backend not available in this e2e environment.
    // Tests that call Go methods should handle this themselves.
  }
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
