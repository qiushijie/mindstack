import { Page } from '@playwright/test'

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('#app', { state: 'attached' })
  await page.waitForSelector('.cm-editor', { state: 'visible', timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

export async function resetAppState(page: Page): Promise<void> {
  await page.evaluate(() => {
    return (window as any).__resetFileTreeState?.()
  })
}

export async function navigateTo(page: Page, name: 'editor' | 'settings'): Promise<void> {
  await page.evaluate((n) => {
    // Exposed in DEV mode by useNavigation.ts
    ;(window as any).__navigateTo?.(n)
  }, name)
  await page.waitForTimeout(100)
}
