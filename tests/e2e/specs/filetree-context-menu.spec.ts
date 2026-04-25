import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import {
  openTestWorkspace,
  waitForTreeReady,
  getTreeItem,
  openTreeContextMenu,
  getTreeContextMenu,
  getTreeMenuItem,
  clickTreeMenuItem,
} from '../helpers/filetree'

test.describe('File Tree Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should display tree items after opening workspace', async ({ page }) => {
    await expect(getTreeItem(page, 'readme.md')).toBeVisible()
    await expect(getTreeItem(page, 'code.md')).toBeVisible()
    await expect(getTreeItem(page, 'image.md')).toBeVisible()
    await expect(getTreeItem(page, 'notes')).toBeVisible()
  })

  test('should show context menu on file right-click', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')

    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await expect(getTreeMenuItem(page, 'Copy')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Paste')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Copy Path')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Copy Relative Path')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Delete')).toBeVisible()
  })

  test('should show context menu on directory right-click', async ({ page }) => {
    await openTreeContextMenu(page, 'notes')

    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await expect(getTreeMenuItem(page, 'Copy')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Paste')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Copy Path')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Copy Relative Path')).toBeVisible()
    await expect(getTreeMenuItem(page, 'Delete')).toBeVisible()
  })

  test('should close context menu when clicking elsewhere', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')

    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await expect(menu).toBeHidden()
  })

  test.skip('should delete file via context menu', async ({ page }) => {
    // Skipped because ConfirmDelete uses Wails runtime.MessageDialog,
    // a native modal dialog that Playwright cannot automate in e2e tests.
    await openTreeContextMenu(page, 'readme.md')
    await clickTreeMenuItem(page, 'Delete')
    // After confirming deletion, the file should disappear from the tree.
    await expect(getTreeItem(page, 'readme.md')).toBeHidden()
  })

  test.skip('should delete directory via context menu', async ({ page }) => {
    // Skipped because ConfirmDelete uses Wails runtime.MessageDialog,
    // a native modal dialog that Playwright cannot automate in e2e tests.
    await openTreeContextMenu(page, 'notes')
    await clickTreeMenuItem(page, 'Delete')
    // After confirming deletion, the directory should disappear from the tree.
    await expect(getTreeItem(page, 'notes')).toBeHidden()
  })
})
