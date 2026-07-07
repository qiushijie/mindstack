import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { createTempWorkspace, cleanupTempWorkspace } from '../helpers/filetree'
import { backupConfig, restoreConfig, readConfig, writeConfig, clearSessionPaths } from '../helpers/config'
import { mockGitBindings, mockGoBinding, mockGoBindingsBatch } from '../helpers/goBindings'
import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
} as Record<string, string>

function initGit(cwd: string) {
  cp.execSync('git init', { cwd })
  cp.execSync('git add -A', { cwd })
  cp.execSync('git commit -m "initial"', { cwd, env: GIT_ENV })
}

function removeGit(cwd: string) {
  const gitDir = path.join(cwd, '.git')
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true })
  }
}

async function openWorkspace(page: import('@playwright/test').Page, wsPath: string) {
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

async function waitForTreeReady(page: import('@playwright/test').Page) {
  await page.waitForSelector('.sidebar-tree', { state: 'visible' })
}

test.describe.configure({ mode: 'serial' })

test.describe('Git Extreme - Empty Commit', () => {
  let configBackup: string | null = null
  let currentWorkspace: string | null = null

  test.beforeAll(() => {
    configBackup = backupConfig()
  })

  test.afterAll(() => {
    restoreConfig(configBackup)
  })

  test.beforeEach(async ({ page }) => {
    const cfg = clearSessionPaths(readConfig())
    writeConfig(cfg)

    currentWorkspace = createTempWorkspace()

    await page.goto('/')
    await waitForAppReady(page)

    await mockGoBindingsBatch(page, {
      SetWorkspaceRoot: () => Promise.resolve(),
    })
    await mockGitBindings(page, { workspace: currentWorkspace, defaultBranch: 'main' })

    removeGit(currentWorkspace)
  })

  test.afterEach(() => {
    if (currentWorkspace && fs.existsSync(currentWorkspace)) {
      fs.rmSync(currentWorkspace, { recursive: true, force: true })
      currentWorkspace = null
    }
  })

  test('should show error when committing with no changes', async ({ page }) => {
    initGit(currentWorkspace!)
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    // Mock git to report clean working tree
    await mockGoBinding(page, 'GitStatus', () =>
      Promise.resolve(JSON.stringify({ clean: true, files: [] })),
    )
    await mockGoBinding(page, 'GitCommitFiles', () =>
      Promise.resolve(JSON.stringify({ error: 'nothing to commit, working tree clean' })),
    )

    // Open commit dialog via test hook
    await page.evaluate(() => (window as any).__testShowCommitDialog?.())
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()

    // Dialog visible, file list empty
    await expect(page.locator('.commit-files-empty')).toBeVisible()

    // Fill commit message and submit
    await page.locator('.commit-msg-textarea').fill('test: empty commit')
    await page.locator('.commit-btn-primary').click()

    // Status message should show the specific git error
    const statusMsg = page.locator('.commit-dialog-status')
    await expect(statusMsg).toContainText('nothing to commit', { timeout: 5000 })

    // Commit button should recover from loading state (no longer disabled by loading)
    const commitBtn = page.locator('.commit-btn-primary')
    await expect(commitBtn).toBeEnabled()
  })

  test('should show no changed files in commit dialog', async ({ page }) => {
    initGit(currentWorkspace!)
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    // Mock git to report clean working tree
    await mockGoBinding(page, 'GitStatus', () =>
      Promise.resolve(JSON.stringify({ clean: true, files: [] })),
    )

    // Open commit dialog via test hook
    await page.evaluate(() => (window as any).__testShowCommitDialog?.())
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()

    // Commit dialog should show empty file list with correct text
    const emptyEl = page.locator('.commit-files-empty')
    await expect(emptyEl).toBeVisible()
    await expect(emptyEl).toHaveText('No changed files')

    // No file rows should exist
    const fileRows = page.locator('.commit-file-row')
    expect(await fileRows.count()).toBe(0)

    // AI generate button should be disabled when no files
    const aiBtn = page.locator('.commit-btn-ai')
    await expect(aiBtn).toBeDisabled()
  })
})
