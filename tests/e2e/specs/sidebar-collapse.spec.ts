import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady } from '../helpers/filetree'

test.describe('Sidebar Collapse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should be expanded by default', async ({ page }) => {
    const sidebar = page.locator('.sidebar')
    await expect(sidebar).not.toHaveClass(/collapsed/)

    // sidebar-header is always rendered; search/tree are only visible when expanded
    await expect(page.locator('.sidebar-header')).toBeVisible()
    await expect(page.locator('.sidebar-search')).toBeVisible()
    await expect(page.locator('.sidebar-tree')).toBeVisible()
    await expect(page.locator('.section-label')).toHaveText('工作区')
  })

  test('should collapse when toggle button is clicked', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-new-btn')
    await toggleBtn.click()

    const sidebar = page.locator('.sidebar')
    await expect(sidebar).toHaveClass(/collapsed/)

    await expect(page.locator('.sidebar-search')).toBeHidden()
    await expect(page.locator('.sidebar-tree')).toBeHidden()
  })

  test('should expand when toggle button is clicked again', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-new-btn')

    // Collapse
    await toggleBtn.click()
    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/)

    // Expand again
    await toggleBtn.click()

    const sidebar = page.locator('.sidebar')
    await expect(sidebar).not.toHaveClass(/collapsed/)

    await expect(page.locator('.sidebar-header')).toBeVisible()
    await expect(page.locator('.sidebar-search')).toBeVisible()
    await expect(page.locator('.sidebar-tree')).toBeVisible()
  })

  test('should keep toggle button visible in collapsed state', async ({ page }) => {
    const toggleBtn = page.locator('.sidebar-new-btn')
    await toggleBtn.click()

    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/)
    await expect(toggleBtn).toBeVisible()
  })
})
