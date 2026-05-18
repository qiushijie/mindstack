import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem } from '../helpers/filetree'
import { getContent } from '../helpers/editor'

async function openFileFromTree(page: import('@playwright/test').Page, name: string) {
  await getTreeItem(page, name).click()
  await page.waitForTimeout(800)
}

async function switchToTab(page: import('@playwright/test').Page, index: number) {
  const tabs = page.locator('.tab-item')
  await tabs.nth(index).click()
  await page.waitForTimeout(500)
}

async function getActiveTabTitle(page: import('@playwright/test').Page): Promise<string> {
  const activeTab = page.locator('.tab-item.active')
  const text = await activeTab.locator('.tab-title').textContent()
  return text ?? ''
}

function hasDirtyIndicator(page: import('@playwright/test').Page, index: number) {
  return page.locator('.tab-item').nth(index).locator('.tab-dirty-dot').count()
}

test.describe('Tab Bar State Migration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await page.evaluate(() => {
      ;(window as any).__resetFileTreeState?.()
      ;(window as any).__clearTabs?.()
    })
    await page.waitForTimeout(300)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should preserve dirty content when switching tabs', async ({ page }) => {
    // Open file A and make it dirty
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    await page.locator('.cm-content').click()
    await page.keyboard.type(' modified', { delay: 20 })
    await page.waitForTimeout(300)

    const contentA = await getContent(page)
    expect(contentA).toContain('modified')

    // Open file B
    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(500)

    // Content should be from file B
    const contentB = await getContent(page)
    expect(contentB).not.toContain('modified')

    // Switch back to file A
    await switchToTab(page, 0)
    await page.waitForTimeout(500)

    // Content should still have the modification
    const contentAAgain = await getContent(page)
    expect(contentAAgain).toContain('modified')
    expect(contentAAgain).toBe(contentA)
  })

  test('should show dirty indicator on tab after editing', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    // Initially no dirty indicator
    expect(await hasDirtyIndicator(page, 0)).toBe(0)

    // Type to make dirty
    await page.locator('.cm-content').click()
    await page.keyboard.type(' unsaved', { delay: 20 })
    await page.waitForTimeout(300)

    // Dirty indicator should appear
    expect(await hasDirtyIndicator(page, 0)).toBe(1)
  })

  test('should persist dirty state across multiple tab switches', async ({ page }) => {
    // Open three files
    await openFileFromTree(page, 'readme.md')
    await openFileFromTree(page, 'code.md')
    await openFileFromTree(page, 'image.md')
    await page.waitForTimeout(500)

    // Make readme dirty
    await switchToTab(page, 0)
    await page.locator('.cm-content').click()
    await page.keyboard.type(' A', { delay: 20 })
    await page.waitForTimeout(300)

    // Make code dirty
    await switchToTab(page, 1)
    await page.locator('.cm-content').click()
    await page.keyboard.type(' B', { delay: 20 })
    await page.waitForTimeout(300)

    // Both tabs should show dirty indicator
    expect(await hasDirtyIndicator(page, 0)).toBe(1)
    expect(await hasDirtyIndicator(page, 1)).toBe(1)
    expect(await hasDirtyIndicator(page, 2)).toBe(0)

    // Switch through all tabs and verify content persistence
    await switchToTab(page, 0)
    await page.waitForTimeout(300)
    expect(await getContent(page)).toContain(' A')

    await switchToTab(page, 1)
    await page.waitForTimeout(300)
    expect(await getContent(page)).toContain(' B')

    await switchToTab(page, 2)
    await page.waitForTimeout(300)
    const contentC = await getContent(page)
    expect(contentC).not.toContain(' A')
    expect(contentC).not.toContain(' B')
  })

  test('should restore clean content when switching to unmodified tab', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    const originalContent = await getContent(page)

    // Make dirty
    await page.locator('.cm-content').click()
    await page.keyboard.type(' extra', { delay: 20 })
    await page.waitForTimeout(300)

    // Switch to another file and back without saving
    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(500)

    await switchToTab(page, 0)
    await page.waitForTimeout(500)

    // Content should still have the unsaved changes
    const currentContent = await getContent(page)
    expect(currentContent).toContain(' extra')
    expect(currentContent).not.toBe(originalContent)
  })

  test('should handle close-other with dirty tabs', async ({ page }) => {
    // Open two files and make both dirty
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)
    await page.locator('.cm-content').click()
    await page.keyboard.type(' dirty1', { delay: 20 })
    await page.waitForTimeout(300)

    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(500)
    await page.locator('.cm-content').click()
    await page.keyboard.type(' dirty2', { delay: 20 })
    await page.waitForTimeout(300)

    // Right-click on first tab and close others
    await page.locator('.tab-item').nth(0).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.locator('.context-menu-item').filter({ hasText: '关闭其他' }).click()
    await page.waitForTimeout(500)

    // Confirm dialog should appear because code.md is dirty
    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()
    await expect(page.locator('.confirm-dialog-header')).toContainText('未保存的更改')

    // Discard all changes
    await page.locator('.btn-cancel').click()
    await page.waitForTimeout(500)

    // Only first tab should remain
    await expect(page.locator('.tab-item')).toHaveCount(1)
    await expect(page.locator('.tab-item').locator('.tab-title')).toHaveText('readme')
  })

  test('should handle close-all with multiple dirty tabs', async ({ page }) => {
    // Open two files and make both dirty
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)
    await page.locator('.cm-content').click()
    await page.keyboard.type(' dirty1', { delay: 20 })
    await page.waitForTimeout(300)

    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(500)
    await page.locator('.cm-content').click()
    await page.keyboard.type(' dirty2', { delay: 20 })
    await page.waitForTimeout(300)

    // Close all via context menu on first tab
    await page.locator('.tab-item').nth(0).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.locator('.context-menu-item').filter({ hasText: '关闭全部' }).click()
    await page.waitForTimeout(500)

    // Confirm dialog should appear
    await expect(page.locator('.confirm-dialog-overlay')).toBeVisible()
    await expect(page.locator('.confirm-dialog-header')).toContainText('未保存的更改')

    // Discard all
    await page.locator('.btn-cancel').click()
    await page.waitForTimeout(500)

    // No tabs should remain
    await expect(page.locator('.tab-item')).toHaveCount(0)
  })

  test('should keep dirty indicator after switching away and back', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await page.waitForTimeout(500)

    // Make dirty
    await page.locator('.cm-content').click()
    await page.keyboard.type(' edit', { delay: 20 })
    await page.waitForTimeout(300)

    // Verify dirty
    expect(await hasDirtyIndicator(page, 0)).toBe(1)

    // Open another file
    await openFileFromTree(page, 'code.md')
    await page.waitForTimeout(500)

    // Switch back
    await switchToTab(page, 0)
    await page.waitForTimeout(500)

    // Dirty indicator should still be there
    expect(await hasDirtyIndicator(page, 0)).toBe(1)
  })
})
