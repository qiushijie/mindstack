import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady } from '../helpers/filetree'
import { setContent, getContent } from '../helpers/editor'
import { getTreeItem } from '../helpers/filetree'

test.describe('Editor Heading Outline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Open a file so we have content in the editor
    await getTreeItem(page, 'readme.md').click()
    await page.waitForTimeout(300)
  })

  test('should render heading outline when switching to heading view', async ({ page }) => {
    await setContent(page, '# Title\n## Section A\n### Sub A1\n## Section B\n')
    await page.waitForTimeout(200)

    // Switch to heading view
    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    const headings = page.locator('.heading-item')
    await expect(headings).toHaveCount(4)
    await expect(headings.nth(0)).toContainText('Title')
    await expect(headings.nth(1)).toContainText('Section A')
    await expect(headings.nth(2)).toContainText('Sub A1')
    await expect(headings.nth(3)).toContainText('Section B')
  })

  test('should switch back to file tree view', async ({ page }) => {
    await setContent(page, '# Title\n## Section A\n')
    await page.waitForTimeout(200)

    // Switch to heading view
    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)
    await expect(page.locator('.heading-outline')).toBeVisible()

    // Switch back to file view
    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)
    await expect(page.locator('.sidebar-tree')).toBeVisible()
  })

  test('should show empty state when no headings', async ({ page }) => {
    await setContent(page, 'Just plain text without any headings.\n')
    await page.waitForTimeout(200)

    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    await expect(page.locator('.heading-empty')).toBeVisible()
  })

  test('should highlight active heading on click', async ({ page }) => {
    await setContent(page, '# Title\n## Section A\n## Section B\n')
    await page.waitForTimeout(200)

    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    const headings = page.locator('.heading-item')
    await headings.nth(1).click()
    await page.waitForTimeout(200)

    await expect(headings.nth(1)).toHaveClass(/active/)
  })

  test('should filter headings by search query', async ({ page }) => {
    await setContent(page, '# Apple\n## Banana\n## Cherry\n')
    await page.waitForTimeout(200)

    await page.locator('.view-toggle-btn').click()
    await page.waitForTimeout(200)

    // Type in sidebar search to filter
    const searchInput = page.locator('.search-input')
    await searchInput.fill('Ban')
    await page.waitForTimeout(300)

    const headings = page.locator('.heading-item')
    await expect(headings).toHaveCount(1)
    await expect(headings.nth(0)).toContainText('Banana')
  })
})
