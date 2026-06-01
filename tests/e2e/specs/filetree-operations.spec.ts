import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem, openTreeContextMenu, getTreeContextMenu, getTreeMenuItem, clickTreeMenuItem } from '../helpers/filetree'

test.describe('File Tree Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should select file on click', async ({ page }) => {
    const item = getTreeItem(page, 'readme.md')
    await item.click()
    await page.waitForTimeout(200)

    await expect(item).toHaveClass(/active/)
  })

  test('should switch to heading outline view', async ({ page }) => {
    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    await expect(page.locator('.heading-outline')).toBeVisible()
    await expect(page.locator('.file-tree-content')).toBeHidden()
  })

  test('should switch back to file tree view', async ({ page }) => {
    // Switch to heading view
    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    // Switch back to file view
    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    await expect(page.locator('.file-tree-content')).toBeVisible()
    await expect(page.locator('.heading-outline')).toBeHidden()
  })

  test('should show context menu on right click', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')

    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    // Verify menu items exist
    await expect(getTreeMenuItem(page, '复制')).toBeVisible()
    await expect(getTreeMenuItem(page, '复制路径')).toBeVisible()
    await expect(getTreeMenuItem(page, '复制相对路径')).toBeVisible()
    await expect(getTreeMenuItem(page, '删除')).toBeVisible()
  })

  test('should close context menu after clicking copy', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')
    await clickTreeMenuItem(page, '复制')
    await page.waitForTimeout(300)

    await expect(getTreeContextMenu(page)).toBeHidden()
  })

  test('should show all tree items initially', async ({ page }) => {
    const items = page.locator('.tree-item')
    await expect(items).toHaveCount(4)
    await expect(getTreeItem(page, 'readme.md')).toBeVisible()
    await expect(getTreeItem(page, 'code.md')).toBeVisible()
    await expect(getTreeItem(page, 'image.md')).toBeVisible()
    await expect(getTreeItem(page, 'notes')).toBeVisible()
  })
})
