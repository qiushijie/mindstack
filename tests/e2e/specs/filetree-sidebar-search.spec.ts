import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem } from '../helpers/filetree'

test.describe('File Tree Sidebar Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should have search input', async ({ page }) => {
    const searchInput = page.locator('.search-input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', /搜索/)
  })

  test('should filter tree by search query', async ({ page }) => {
    const searchInput = page.locator('.search-input')
    await searchInput.fill('code')
    await page.waitForTimeout(300)

    // code.md matches, unexpanded directories (notes with empty children) are kept visible
    const items = page.locator('.tree-item')
    await expect(items).toHaveCount(2)
    await expect(getTreeItem(page, 'code.md')).toBeVisible()
    await expect(getTreeItem(page, 'notes')).toBeVisible()
    await expect(getTreeItem(page, 'readme.md')).toBeHidden()
    await expect(getTreeItem(page, 'image.md')).toBeHidden()
  })

  test('should clear search and restore full tree', async ({ page }) => {
    const searchInput = page.locator('.search-input')
    await searchInput.fill('read')
    await page.waitForTimeout(300)

    await searchInput.fill('')
    await page.waitForTimeout(300)

    const items = page.locator('.tree-item')
    await expect(items).toHaveCount(4)
  })

  test('should hide unmatched files while keeping unexpanded directories', async ({ page }) => {
    const searchInput = page.locator('.search-input')
    await searchInput.fill('nonexistent')
    await page.waitForTimeout(300)

    // Unexpanded directories (notes with empty children) are kept visible
    const items = page.locator('.tree-item')
    await expect(items).toHaveCount(1)
    await expect(getTreeItem(page, 'notes')).toBeVisible()
  })
})
