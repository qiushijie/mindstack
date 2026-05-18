import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady } from '../helpers/filetree'
import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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

const CONFIG_PATH = path.join(os.homedir(), 'Library/Application Support/mindstack/config.json')

async function mockGoBindings(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    if (!(window as any).go) {
      (window as any).go = { main: { App: {} } }
    }
    ;(window as any).go.main.App.SetWorkspaceRoot = () => Promise.resolve()
  })
}

async function mockGitClean(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    ;(window as any).go.main.App.GitStatus = () =>
      Promise.resolve(JSON.stringify({ clean: true, files: [] }))
  })
}

async function mockGitCommitNothing(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    ;(window as any).go.main.App.GitCommitFiles = () =>
      Promise.resolve(JSON.stringify({ error: 'nothing to commit, working tree clean' }))
  })
}

test.describe('Git Extreme - Empty Commit', () => {
  let configBackup: string | null = null

  test.beforeAll(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      configBackup = fs.readFileSync(CONFIG_PATH, 'utf-8')
    }
  })

  test.afterAll(() => {
    if (configBackup !== null) {
      try {
        fs.writeFileSync(CONFIG_PATH, configBackup)
      } catch {
        // best effort restore
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
        const cfg = JSON.parse(raw)
        delete cfg.lastFolderPath
        delete cfg.lastFilePath
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg))
      } catch {
        fs.writeFileSync(CONFIG_PATH, '{}')
      }
    }

    await page.goto('/')
    await waitForAppReady(page)
    await mockGoBindings(page)
    removeGit(path.resolve(__dirname, '../fixtures/workspace'))
  })

  test('should show error when committing with no changes', async ({ page }) => {
    const TEST_WORKSPACE = path.resolve(__dirname, '../fixtures/workspace')
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Mock git to report clean working tree
    await mockGitClean(page)
    await mockGitCommitNothing(page)

    // Open commit dialog via test hook
    await page.evaluate(() => (window as any).__testShowCommitDialog?.())
    await page.waitForTimeout(500)

    // Dialog visible, file list empty
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    await expect(page.locator('.commit-files-empty')).toBeVisible()

    // Fill commit message and submit
    await page.locator('.commit-msg-textarea').fill('test: empty commit')
    await page.locator('.commit-btn-primary').click()
    await page.waitForTimeout(800)

    // Status message should show the specific git error
    const statusMsg = page.locator('.commit-dialog-status')
    await expect(statusMsg).toBeVisible()
    const statusText = await statusMsg.textContent()
    expect(statusText).toContain('nothing to commit')

    // Commit button should recover from loading state (no longer disabled by loading)
    const commitBtn = page.locator('.commit-btn-primary')
    await expect(commitBtn).toBeEnabled()
  })

  test('should show no changed files in commit dialog', async ({ page }) => {
    const TEST_WORKSPACE = path.resolve(__dirname, '../fixtures/workspace')
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Mock git to report clean working tree
    await mockGitClean(page)

    // Open commit dialog via test hook
    await page.evaluate(() => (window as any).__testShowCommitDialog?.())
    await page.waitForTimeout(800)

    // Commit dialog should show empty file list with correct text
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    const emptyEl = page.locator('.commit-files-empty')
    await expect(emptyEl).toBeVisible()
    const emptyText = await emptyEl.textContent()
    expect(emptyText?.trim()).toBe('No changed files')

    // No file rows should exist
    const fileRows = page.locator('.commit-file-row')
    expect(await fileRows.count()).toBe(0)

    // AI generate button should be disabled when no files
    const aiBtn = page.locator('.commit-btn-ai')
    await expect(aiBtn).toBeDisabled()
  })
})
