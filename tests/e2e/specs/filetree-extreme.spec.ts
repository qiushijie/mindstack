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

test.describe('File Tree Extreme - Deep Nesting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockGoBindings(page)
  })

  test('should render deeply nested directory structure', async ({ page }) => {
    const wsPath = '/tmp/deep-test-workspace'
    const nodes = [
      {
        name: 'level1',
        path: `${wsPath}/level1`,
        isDir: true,
        expanded: true,
        children: [
          {
            name: 'level2',
            path: `${wsPath}/level1/level2`,
            isDir: true,
            expanded: true,
            children: [
              {
                name: 'level3',
                path: `${wsPath}/level1/level2/level3`,
                isDir: true,
                expanded: true,
                children: [
                  {
                    name: 'level4',
                    path: `${wsPath}/level1/level2/level3/level4`,
                    isDir: true,
                    expanded: true,
                    children: [
                      {
                        name: 'deep.md',
                        path: `${wsPath}/level1/level2/level3/level4/deep.md`,
                        isDir: false,
                        expanded: false,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    // All nodes should be visible
    await expect(getTreeItem(page, 'level1')).toBeVisible()
    await expect(getTreeItem(page, 'level2')).toBeVisible()
    await expect(getTreeItem(page, 'level3')).toBeVisible()
    await expect(getTreeItem(page, 'level4')).toBeVisible()
    await expect(getTreeItem(page, 'deep.md')).toBeVisible()

    // Verify depth increases via padding-left style
    const getPadding = async (name: string) => {
      const el = getTreeItem(page, name)
      const style = await el.evaluate((node) => (node as HTMLElement).style.paddingLeft)
      return parseInt(style || '0', 10)
    }
    const p1 = await getPadding('level1')
    const p2 = await getPadding('level2')
    const p3 = await getPadding('level3')
    const p4 = await getPadding('level4')
    const p5 = await getPadding('deep.md')
    expect(p2).toBeGreaterThan(p1)
    expect(p3).toBeGreaterThan(p2)
    expect(p4).toBeGreaterThan(p3)
    expect(p5).toBeGreaterThan(p4)
  })

  test('should handle many siblings in one directory', async ({ page }) => {
    const wsPath = '/tmp/many-files-workspace'
    const children = Array.from({ length: 50 }, (_, i) => ({
      name: `file${String(i).padStart(3, '0')}.md`,
      path: `${wsPath}/file${String(i).padStart(3, '0')}.md`,
      isDir: false,
      expanded: false,
      children: [],
    }))
    const nodes = [{
      name: 'many',
      path: `${wsPath}/many`,
      isDir: true,
      expanded: true,
      children,
    }]

    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    // Verify first, last, and a middle file are all visible
    await expect(getTreeItem(page, 'file000.md')).toBeVisible()
    await expect(getTreeItem(page, 'file025.md')).toBeVisible()
    await expect(getTreeItem(page, 'file049.md')).toBeVisible()

    // Verify total tree-item count (50 files + 1 parent dir)
    const allItems = page.locator('.tree-item')
    expect(await allItems.count()).toBe(51)
  })
})

test.describe('File Tree Extreme - Special Names', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockGoBindings(page)
  })

  test('should handle filenames with spaces', async ({ page }) => {
    const wsPath = '/tmp/special-names-workspace'
    const nodes = [
      {
        name: 'my file.md',
        path: `${wsPath}/my file.md`,
        isDir: false,
        expanded: false,
        children: [],
      },
    ]
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    await expect(getTreeItem(page, 'my file.md')).toBeVisible()
  })

  test('should handle filenames with Chinese characters', async ({ page }) => {
    const wsPath = '/tmp/chinese-names-workspace'
    const nodes = [
      {
        name: '中文文档.md',
        path: `${wsPath}/中文文档.md`,
        isDir: false,
        expanded: false,
        children: [],
      },
    ]
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    await expect(getTreeItem(page, '中文文档.md')).toBeVisible()
  })

  test('should handle filenames with special symbols', async ({ page }) => {
    const wsPath = '/tmp/symbols-workspace'
    const nodes = [
      {
        name: 'file@v1.0-test.md',
        path: `${wsPath}/file@v1.0-test.md`,
        isDir: false,
        expanded: false,
        children: [],
      },
    ]
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    await expect(getTreeItem(page, 'file@v1.0-test.md')).toBeVisible()
  })
})

test.describe('File Tree Extreme - Empty Directory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await mockGoBindings(page)
  })

  test('should handle empty directory', async ({ page }) => {
    const wsPath = '/tmp/empty-dir-workspace'
    const nodes = [
      {
        name: 'empty_folder',
        path: `${wsPath}/empty_folder`,
        isDir: true,
        expanded: true,
        children: [],
      },
    ]
    await page.evaluate(({ path, nodes }) => {
      return (window as any).__setTestWorkspace?.(path, nodes)
    }, { path: wsPath, nodes })
    await page.waitForTimeout(300)
    await waitForTreeReady(page)

    // Empty folder should be visible
    const folder = getTreeItem(page, 'empty_folder')
    await expect(folder).toBeVisible()

    // Verify there are no child tree-items under the empty folder
    // by checking that total tree-item count is exactly 1
    const allItems = page.locator('.tree-item')
    expect(await allItems.count()).toBe(1)
  })
})
