import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

test.describe('App Startup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test('should load the app shell', async ({ page }) => {
    await expect(page.locator('#app')).toBeVisible()
  })

  test('should show the sidebar', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  test('should initialize CodeMirror editor', async ({ page }) => {
    await expect(page.locator('.cm-editor')).toBeVisible()
    await expect(page.locator('.cm-content')).toBeVisible()
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true')
  })

  test('should show the status bar with defaults', async ({ page }) => {
    const bar = page.locator('.status-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('Markdown')
    await expect(bar).toContainText('行 1, 列 1')
    await expect(bar).toContainText('0 词')
  })

  test('should show sidebar with workspace or empty prompt', async ({ page }) => {
    // Either sidebar-tree (folder open) or sidebar-empty (no folder)
    const hasTree = await page.locator('.sidebar-tree').isVisible().catch(() => false)
    const hasEmpty = await page.locator('.sidebar-empty').isVisible().catch(() => false)
    expect(hasTree || hasEmpty).toBe(true)
  })
})
