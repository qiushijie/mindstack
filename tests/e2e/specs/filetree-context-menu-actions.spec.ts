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

test.describe('File Tree Context Menu Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should copy file name and close menu', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await clickTreeMenuItem(page, '复制')
    await page.waitForTimeout(300)

    await expect(menu).toBeHidden()
  })

  test('should copy file path and close menu', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await clickTreeMenuItem(page, '复制路径')
    await page.waitForTimeout(300)

    await expect(menu).toBeHidden()
  })

  test('should copy relative path and close menu', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await clickTreeMenuItem(page, '复制相对路径')
    await page.waitForTimeout(300)

    await expect(menu).toBeHidden()
  })

  test('should copy directory name and close menu', async ({ page }) => {
    await openTreeContextMenu(page, 'notes')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await clickTreeMenuItem(page, '复制')
    await page.waitForTimeout(300)

    await expect(menu).toBeHidden()
  })

  test('should disable paste when no file is copied', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__setCopiedFilePath?.('')
    })
    await page.waitForTimeout(100)

    await openTreeContextMenu(page, 'notes')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    const pasteItem = getTreeMenuItem(page, '粘贴')
    const isDisabled = await pasteItem.evaluate(el => el.classList.contains('disabled'))
    expect(isDisabled).toBe(true)
  })

  test('should enable paste when a file is copied', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__setCopiedFilePath?.('/some/path/readme.md')
    })
    await page.waitForTimeout(100)

    await openTreeContextMenu(page, 'notes')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    const pasteItem = getTreeMenuItem(page, '粘贴')
    const isDisabled = await pasteItem.evaluate(el => el.classList.contains('disabled'))
    expect(isDisabled).toBe(false)
  })

  test('should enable paste on file when a file is copied', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__setCopiedFilePath?.('/some/path/readme.md')
    })
    await page.waitForTimeout(100)

    await openTreeContextMenu(page, 'readme.md')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    const pasteItem = getTreeMenuItem(page, '粘贴')
    const isDisabled = await pasteItem.evaluate(el => el.classList.contains('disabled'))
    expect(isDisabled).toBe(false)
  })

  test('should close menu after clicking paste', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__setCopiedFilePath?.('/some/path/readme.md')
    })
    await page.waitForTimeout(100)

    await openTreeContextMenu(page, 'notes')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await clickTreeMenuItem(page, '粘贴')
    await page.waitForTimeout(300)

    await expect(menu).toBeHidden()
  })

  test('should show all menu items for file', async ({ page }) => {
    await openTreeContextMenu(page, 'readme.md')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await expect(getTreeMenuItem(page, '复制')).toBeVisible()
    await expect(getTreeMenuItem(page, '粘贴')).toBeVisible()
    await expect(getTreeMenuItem(page, '复制路径')).toBeVisible()
    await expect(getTreeMenuItem(page, '复制相对路径')).toBeVisible()
    await expect(getTreeMenuItem(page, '删除')).toBeVisible()
  })

  test('should show all menu items for directory', async ({ page }) => {
    await openTreeContextMenu(page, 'notes')
    const menu = getTreeContextMenu(page)
    await expect(menu).toBeVisible()

    await expect(getTreeMenuItem(page, '复制')).toBeVisible()
    await expect(getTreeMenuItem(page, '粘贴')).toBeVisible()
    await expect(getTreeMenuItem(page, '复制路径')).toBeVisible()
    await expect(getTreeMenuItem(page, '复制相对路径')).toBeVisible()
    await expect(getTreeMenuItem(page, '删除')).toBeVisible()
  })
})
