import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem } from '../helpers/filetree'

async function openFileFromTree(page: import('@playwright/test').Page, name: string) {
  await getTreeItem(page, name).click()
  await page.waitForTimeout(800)
}

test.describe('Tab Bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    // Reset any state left by previous tests
    await page.evaluate(() => {
      ;(window as any).__resetFileTreeState?.()
      ;(window as any).__clearTabs?.()
    })
    await page.waitForTimeout(300)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should open a tab when clicking a file in the tree', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')

    const tab = page.locator('.tab-item')
    await expect(tab).toBeVisible()
    await expect(tab.locator('.tab-title')).toHaveText('readme')
  })

  test('should show multiple tabs when opening multiple files', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await openFileFromTree(page, 'code.md')
    await openFileFromTree(page, 'image.md')

    await expect(page.locator('.tab-item')).toHaveCount(3)
  })

  test('should switch active tab on click', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await openFileFromTree(page, 'code.md')

    // code.md tab should be active (last opened)
    const tabs = page.locator('.tab-item')
    await expect(tabs.nth(1)).toHaveClass(/active/)

    // Click first tab (readme)
    await tabs.nth(0).click()
    await page.waitForTimeout(400)

    await expect(tabs.nth(0)).toHaveClass(/active/)
  })

  test('should close a tab when clicking its close button', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await expect(page.locator('.tab-item')).toHaveCount(1)

    // Close button is visible on active tab
    await page.locator('.tab-item').locator('.tab-close').click()
    await page.waitForTimeout(500)

    await expect(page.locator('.tab-item')).toHaveCount(0)
  })

  test('should close other tabs via context menu', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await openFileFromTree(page, 'code.md')
    await openFileFromTree(page, 'image.md')
    await expect(page.locator('.tab-item')).toHaveCount(3)

    // Right-click on the first tab and close others
    await page.locator('.tab-item').nth(0).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.locator('.context-menu-item').filter({ hasText: '关闭其他' }).click()
    await page.waitForTimeout(500)

    // Only the first tab should remain
    await expect(page.locator('.tab-item')).toHaveCount(1)
    await expect(page.locator('.tab-item').locator('.tab-title')).toHaveText('readme')
  })

  test('should close all tabs via context menu', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await openFileFromTree(page, 'code.md')
    await expect(page.locator('.tab-item')).toHaveCount(2)

    await page.locator('.tab-item').nth(0).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.locator('.context-menu-item').filter({ hasText: '关闭全部' }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('.tab-item')).toHaveCount(0)
  })

  test('should show confirm dialog when closing a dirty tab', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    // Type in editor to make it dirty
    await page.locator('.cm-content').click()
    await page.waitForTimeout(100)
    await page.keyboard.type('unsaved content', { delay: 30 })
    await page.waitForTimeout(300)

    // Click close button
    await page.locator('.tab-item').locator('.tab-close').click()
    await page.waitForTimeout(300)

    // Confirm dialog should appear
    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()
    await expect(page.locator('.confirm-dialog-header')).toContainText('未保存的更改')
    await expect(page.locator('.btn-confirm')).toContainText('保存')
    await expect(page.locator('.btn-cancel')).toContainText('丢弃')
  })

  test('should discard changes and close tab', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    await page.locator('.cm-content').click()
    await page.keyboard.type('unsaved content', { delay: 30 })
    await page.waitForTimeout(300)

    // Close and discard
    await page.locator('.tab-item').locator('.tab-close').click()
    await page.waitForTimeout(300)
    await page.locator('.btn-cancel').click()
    await page.waitForTimeout(500)

    await expect(page.locator('.tab-item')).toHaveCount(0)
  })

  // Skip: save requires Wails Go backend (SaveFileContent binding), which is
  // unavailable when Playwright connects to the Vite dev server directly.
  test.skip('should save and close tab', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    await page.locator('.cm-content').click()
    await page.keyboard.type('new content', { delay: 30 })
    await page.waitForTimeout(300)

    // Close and save
    await page.locator('.tab-item').locator('.tab-close').click()
    await page.waitForTimeout(300)
    await page.locator('.btn-confirm').click()
    await page.waitForTimeout(500)

    await expect(page.locator('.tab-item')).toHaveCount(0)
  })

  test('should show confirm dialog for close others with dirty tab', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(500)

    // Make code.md (active tab) dirty
    await page.locator('.cm-content').click()
    await page.keyboard.type('dirty', { delay: 30 })
    await page.waitForTimeout(300)

    // Right-click on readme.md tab and close others
    await page.locator('.tab-item').nth(0).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.locator('.context-menu-item').filter({ hasText: '关闭其他' }).click()
    await page.waitForTimeout(300)

    // Confirm dialog should appear
    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()
  })

  test('should discard all and close tabs for close-all with dirty files', async ({ page }) => {
    // Open first file and make dirty
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(400)
    await page.locator('.cm-content').click()
    await page.keyboard.type('dirty1', { delay: 20 })
    await page.waitForTimeout(200)

    // Open second file and make dirty
    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(400)
    await page.locator('.cm-content').click()
    await page.keyboard.type('dirty2', { delay: 20 })
    await page.waitForTimeout(200)

    // Close all via context menu
    await page.locator('.tab-item').nth(0).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.locator('.context-menu-item').filter({ hasText: '关闭全部' }).click()
    await page.waitForTimeout(300)

    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()
    await expect(page.locator('.confirm-dialog-header')).toContainText('未保存的更改')

    // Discard all
    await page.locator('.btn-cancel').click()
    await page.waitForTimeout(500)

    await expect(page.locator('.tab-item')).toHaveCount(0)
  })
})
