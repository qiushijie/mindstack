import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem } from '../helpers/filetree'

async function mockGoBindings(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    if (!(window as any).go) {
      (window as any).go = { main: { App: {} } }
    }
    ;(window as any).go.main.App.SetWorkspaceRoot = () => Promise.resolve()
  })
}

test.describe('Tab Bar Extreme - Tab Deduplication & Overflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await page.evaluate(() => {
      ;(window as any).__clearTabs?.()
    })
    await page.waitForTimeout(300)
    await mockGoBindings(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should deduplicate clicks on the same file', async ({ page }) => {
    // Click the same file 5 times
    for (let i = 0; i < 5; i++) {
      await getTreeItem(page, 'readme.md').click()
      await page.waitForTimeout(200)
    }

    const tabs = page.locator('.tab-item')
    // Same file should result in exactly 1 tab
    expect(await tabs.count()).toBe(1)
    await expect(page.locator('.tab-item .tab-title')).toHaveText('readme')
  })

  test('should open multiple tabs for different files', async ({ page }) => {
    await getTreeItem(page, 'readme.md').click()
    await page.waitForTimeout(200)
    await getTreeItem(page, 'code.md').click()
    await page.waitForTimeout(200)
    await getTreeItem(page, 'image.md').click()
    await page.waitForTimeout(200)

    const tabs = page.locator('.tab-item')
    expect(await tabs.count()).toBe(3)

    const titles = await tabs.locator('.tab-title').allTextContents()
    expect(titles).toContain('readme')
    expect(titles).toContain('code')
    expect(titles).toContain('image')
  })

  test('should keep tab bar visible with many tabs', async ({ page }) => {
    const wsPath = '/tmp/many-tabs-workspace'
    const children = Array.from({ length: 15 }, (_, i) => ({
      name: `file${String(i).padStart(2, '0')}.md`,
      path: `${wsPath}/file${String(i).padStart(2, '0')}.md`,
      isDir: false,
      expanded: false,
      children: [],
    }))
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes: children })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    // Open all files
    for (let i = 0; i < 15; i++) {
      await getTreeItem(page, `file${String(i).padStart(2, '0')}.md`).click()
      await page.waitForTimeout(150)
    }

    const tabs = page.locator('.tab-item')
    expect(await tabs.count()).toBe(15)
    await expect(page.locator('.tab-bar')).toBeVisible()

    // Verify tab bar has horizontal scroll capability (overflow-x: auto)
    const scrollWidth = await page.locator('.tab-bar').evaluate((el) => el.scrollWidth)
    const clientWidth = await page.locator('.tab-bar').evaluate((el) => el.clientWidth)
    expect(scrollWidth).toBeGreaterThan(clientWidth)
  })
})

test.describe('Tab Bar Extreme - Same Name Files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockGoBindings(page)
  })

  test('should distinguish files with same name in different directories', async ({ page }) => {
    const wsPath = '/tmp/same-name-workspace'
    const nodes = [
      {
        name: 'readme.md',
        path: `${wsPath}/readme.md`,
        isDir: false,
        expanded: false,
        children: [],
      },
      {
        name: 'docs',
        path: `${wsPath}/docs`,
        isDir: true,
        expanded: true,
        children: [
          {
            name: 'readme.md',
            path: `${wsPath}/docs/readme.md`,
            isDir: false,
            expanded: false,
            children: [],
          },
        ],
      },
    ]
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    // Open both files
    await getTreeItem(page, 'readme.md').first().click()
    await page.waitForTimeout(400)
    await getTreeItem(page, 'readme.md').nth(1).click()
    await page.waitForTimeout(400)

    const tabs = page.locator('.tab-item')
    expect(await tabs.count()).toBe(2)

    // Both tabs show the same title (filename without extension)
    const titles = await tabs.locator('.tab-title').allTextContents()
    expect(titles.filter(t => t === 'readme').length).toBe(2)

    // Verify active tab switches correctly
    await tabs.first().click()
    await page.waitForTimeout(100)
    await expect(tabs.first()).toHaveClass(/active/)

    await tabs.nth(1).click()
    await page.waitForTimeout(100)
    await expect(tabs.nth(1)).toHaveClass(/active/)
  })
})

test.describe('Tab Bar Extreme - Switch Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await page.evaluate(() => {
      ;(window as any).__clearTabs?.()
    })
    await page.waitForTimeout(300)
    await mockGoBindings(page)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should rapidly switch tabs without losing active state', async ({ page }) => {
    // Open multiple different files
    await getTreeItem(page, 'readme.md').click()
    await page.waitForTimeout(300)
    await getTreeItem(page, 'code.md').click()
    await page.waitForTimeout(300)
    await getTreeItem(page, 'image.md').click()
    await page.waitForTimeout(300)

    const tabs = page.locator('.tab-item')
    expect(await tabs.count()).toBe(3)

    // Rapidly switch between tabs
    for (let i = 0; i < 10; i++) {
      await tabs.nth(i % 3).click()
      await page.waitForTimeout(50)
    }

    // Final active tab should have correct active class (last click was i=9, 9%3=0)
    await expect(tabs.nth(0)).toHaveClass(/active/)

    // Switch to first tab and verify it becomes active
    await tabs.first().click()
    await page.waitForTimeout(100)
    await expect(tabs.first()).toHaveClass(/active/)
    await expect(tabs.nth(1)).not.toHaveClass(/active/)
    await expect(tabs.nth(2)).not.toHaveClass(/active/)
  })
})
