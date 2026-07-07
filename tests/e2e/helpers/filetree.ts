import { Page, Locator } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export const TEST_WORKSPACE = path.resolve(__dirname, '../fixtures/workspace')

export function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindstack-e2e-'))
  for (const item of fs.readdirSync(TEST_WORKSPACE)) {
    const src = path.join(TEST_WORKSPACE, item)
    const dest = path.join(dir, item)
    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true })
    } else {
      fs.copyFileSync(src, dest)
    }
  }
  return dir
}

export function cleanupTempWorkspace(dir: string | null): void {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export async function openTestWorkspace(page: Page): Promise<void> {
  const wsPath = TEST_WORKSPACE
  const nodes = [
    { name: 'readme.md', path: `${wsPath}/readme.md`, isDir: false, expanded: false, children: [] },
    { name: 'code.md', path: `${wsPath}/code.md`, isDir: false, expanded: false, children: [] },
    { name: 'image.md', path: `${wsPath}/image.md`, isDir: false, expanded: false, children: [] },
    { name: 'notes', path: `${wsPath}/notes`, isDir: true, expanded: false, children: [] },
  ]
  await page.evaluate(({ path, nodes }) => {
    return (window as any).__setTestWorkspace?.(path, nodes)
  }, { path: wsPath, nodes })
  await page.waitForTimeout(300)
}

export async function waitForTreeReady(page: Page): Promise<void> {
  await page.waitForSelector('.sidebar-tree', { state: 'visible' })
}

export function getTreeItem(page: Page, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.locator('.tree-item').filter({ hasText: new RegExp(`^${escaped}$`) })
}

export async function openTreeContextMenu(page: Page, name: string): Promise<void> {
  const item = getTreeItem(page, name)
  await item.click({ button: 'right' })
}

export function getTreeContextMenu(page: Page): Locator {
  return page.locator('.tree-context-menu')
}

export function getTreeMenuItem(page: Page, label: string): Locator {
  return getTreeContextMenu(page).locator('.menu-item', { hasText: new RegExp(`^${label}$`) })
}

export async function clickTreeMenuItem(page: Page, label: string): Promise<void> {
  await getTreeMenuItem(page, label).click()
}
