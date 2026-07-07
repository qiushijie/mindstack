import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { createTempWorkspace, cleanupTempWorkspace, waitForTreeReady } from '../helpers/filetree'
import { backupConfig, restoreConfig, readConfig, writeConfig, clearSessionPaths } from '../helpers/config'
import { mockGitBindings, mockGoBindingsBatch } from '../helpers/goBindings'
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
  cp.execFileSync('git', ['init'], { cwd })
  cp.execFileSync('git', ['add', '-A'], { cwd })
  cp.execFileSync('git', ['commit', '-m', 'initial'], { cwd, env: GIT_ENV })
}

function removeGit(cwd: string) {
  const gitDir = path.join(cwd, '.git')
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true })
  }
}

function getGitLog(cwd: string): string {
  return cp.execFileSync('git', ['log', '--oneline', '-1'], { cwd }).toString().trim()
}

function initGitWithRemote(cwd: string, remoteDir: string) {
  initGit(cwd)
  cp.execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd })
  const branch = cp.execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).toString().trim()
  cp.execFileSync('git', ['push', '-u', 'origin', branch], { cwd, env: GIT_ENV })
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

function createTempRemoteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mindstack-e2e-remote-'))
}

function initBareRemote(remoteDir: string) {
  fs.rmSync(remoteDir, { recursive: true, force: true })
  cp.execFileSync('git', ['init', '--bare', remoteDir])
}

async function getGitStatus(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({ ...(window as any).__gitStatus }))
}

test.describe.configure({ mode: 'serial' })

test.describe('Git Sync', () => {
  let configBackup: string | null = null
  let currentWorkspace: string | null = null
  let currentRemoteDir: string | null = null

  test.beforeAll(() => {
    configBackup = backupConfig()
  })

  test.afterAll(() => {
    restoreConfig(configBackup)
  })

  test.beforeEach(async ({ page }) => {
    const cfg = clearSessionPaths(readConfig())
    cfg.settings = cfg.settings || {}
    cfg.settings.locale = 'zh'
    cfg.settings.theme = 'light'
    cfg.settings.autoSave = true
    cfg.settings.autoCommit = false
    cfg.settings.autoPull = false
    writeConfig(cfg)

    currentWorkspace = createTempWorkspace()
    currentRemoteDir = createTempRemoteDir()

    await page.goto('/')
    await waitForAppReady(page)

    await mockGoBindingsBatch(page, {
      SetWorkspaceRoot: () => Promise.resolve(),
    })
    await mockGitBindings(page, { workspace: currentWorkspace, remoteDir: currentRemoteDir, defaultBranch: 'main' })

    removeGit(currentWorkspace)
    initBareRemote(currentRemoteDir!)
  })

  test.afterEach(() => {
    cleanupTempWorkspace(currentWorkspace)
    currentWorkspace = null
    cleanupTempWorkspace(currentRemoteDir)
    currentRemoteDir = null
  })

  test('prompts to init git when workspace is not a git repository', async ({ page }) => {
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    const dialog = page.locator('.confirm-dialog-overlay')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.confirm-dialog-header')).toHaveText('初始化 Git 仓库')
    await expect(page.locator('.confirm-dialog-body')).toHaveText(
      '此文件夹还不是一个 git 仓库，是否要初始化？'
    )

    await page.locator('.btn-confirm').click()
    await expect(dialog).not.toBeVisible()

    expect(fs.existsSync(path.join(currentWorkspace!, '.git'))).toBe(true)
  })

  test('commits changes with a custom message', async ({ page }) => {
    initGit(currentWorkspace!)
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    fs.appendFileSync(path.join(currentWorkspace!, 'readme.md'), '\n\ncontent for git commit test\n')

    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    await page.locator('.commit-msg-textarea').fill('test: e2e commit')
    await page.locator('.commit-btn-primary').click()
    await expect(page.locator('.commit-dialog-overlay')).not.toBeVisible({ timeout: 10000 })

    const log = getGitLog(currentWorkspace!)
    expect(log).toContain('test: e2e commit')
  })

  test('cancels git init when declining the prompt', async ({ page }) => {
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    const dialog = page.locator('.confirm-dialog-overlay')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await page.locator('.btn-cancel').click()
    await expect(dialog).not.toBeVisible()

    expect(fs.existsSync(path.join(currentWorkspace!, '.git'))).toBe(false)
  })

  test('pushes committed changes to remote', async ({ page }) => {
    initGitWithRemote(currentWorkspace!, currentRemoteDir!)
    cp.execFileSync('git', ['commit', '--allow-empty', '-m', 'test: push e2e'], { cwd: currentWorkspace!, env: GIT_ENV })

    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__handleGitPush())

    await expect(page.locator('[data-testid="git-status"]')).toContainText('推送完成', { timeout: 15000 })
    await expect.poll(async () => (await getGitStatus(page)).status).toContain('推送完成', { timeout: 15000 })

    const remoteLog = cp.execFileSync('git', ['-C', currentRemoteDir!, 'log', '--oneline', '-1'], { env: GIT_ENV }).toString().trim()
    expect(remoteLog).toContain('test: push e2e')
  })

  test('pulls remote changes', async ({ page }) => {
    initGitWithRemote(currentWorkspace!, currentRemoteDir!)

    const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindstack-e2e-clone-'))
    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
      cp.execFileSync('git', ['clone', currentRemoteDir!, cloneDir], { env: GIT_ENV })
      cp.execFileSync('git', ['commit', '--allow-empty', '-m', 'feat: remote change'], { cwd: cloneDir, env: GIT_ENV })
      cp.execFileSync('git', ['push'], { cwd: cloneDir, env: GIT_ENV })
    } finally {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__handleGitPull())

    await expect(page.locator('[data-testid="git-status"]')).toContainText('拉取完成', { timeout: 15000 })
    await expect.poll(async () => (await getGitStatus(page)).status).toContain('拉取完成', { timeout: 15000 })

    const log = getGitLog(currentWorkspace!)
    expect(log).toContain('feat: remote change')
  })

  test('shows error when pushing without remote', async ({ page }) => {
    initGit(currentWorkspace!)
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__handleGitPush())

    await expect(page.locator('[data-testid="git-status"]')).toContainText('Git 错误', { timeout: 10000 })
    await expect.poll(async () => (await getGitStatus(page)).error).toContain('Git 错误', { timeout: 10000 })
  })

  test('shows error when pulling without remote', async ({ page }) => {
    initGit(currentWorkspace!)
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__handleGitPull())

    await expect(page.locator('[data-testid="git-status"]')).toContainText('Git 错误', { timeout: 10000 })
    await expect.poll(async () => (await getGitStatus(page)).error).toContain('Git 错误', { timeout: 10000 })
  })

  test('commits changes via the commit dialog with auto-commit enabled', async ({ page }) => {
    initGitWithRemote(currentWorkspace!, currentRemoteDir!)
    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__navigateTo('settings'))
    await page.waitForSelector('.settings-section', { timeout: 5000 })

    const autoCommitToggle = page.locator('[data-testid="toggle-auto-commit"]')
    const isOn = await autoCommitToggle.evaluate(el => el.classList.contains('on'))
    if (!isOn) {
      await autoCommitToggle.click()
      await page.waitForTimeout(500)
    }

    await page.evaluate(() => (window as any).__navigateTo('editor'))
    await page.waitForSelector('.cm-editor', { timeout: 5000 })

    fs.appendFileSync(path.join(currentWorkspace!, 'readme.md'), '\n\nauto-commit test content\n')

    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    await page.locator('.commit-msg-textarea').fill('test: auto-commit e2e')
    await page.locator('.commit-btn-primary').click()
    await expect(page.locator('.commit-dialog-overlay')).not.toBeVisible({ timeout: 15000 })

    const log = getGitLog(currentWorkspace!)
    expect(log).toContain('auto-commit')

    const remoteLog = cp.execFileSync('git', ['-C', currentRemoteDir!, 'log', '--oneline', '-1'], { env: GIT_ENV }).toString().trim()
    expect(remoteLog).toContain('initial')
  })

  test('shows error when pull fails due to conflicting local changes', async ({ page }) => {
    initGitWithRemote(currentWorkspace!, currentRemoteDir!)

    fs.appendFileSync(path.join(currentWorkspace!, 'readme.md'), '\n\nlocal conflict\n')
    cp.execFileSync('git', ['add', '-A'], { cwd: currentWorkspace! })
    cp.execFileSync('git', ['commit', '-m', 'local change'], { cwd: currentWorkspace!, env: GIT_ENV })

    const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindstack-e2e-clone-'))
    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
      cp.execFileSync('git', ['clone', currentRemoteDir!, cloneDir], { env: GIT_ENV })
      fs.appendFileSync(path.join(cloneDir, 'readme.md'), '\n\nremote conflict\n')
      cp.execFileSync('git', ['add', '-A'], { cwd: cloneDir })
      cp.execFileSync('git', ['commit', '-m', 'remote change'], { cwd: cloneDir, env: GIT_ENV })
      cp.execFileSync('git', ['push'], { cwd: cloneDir, env: GIT_ENV })
    } finally {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__handleGitPull())

    await expect(page.locator('[data-testid="git-status"]')).toContainText('Git 错误', { timeout: 15000 })
    await expect.poll(async () => (await getGitStatus(page)).error).toContain('Git 错误', { timeout: 15000 })
  })

  test('shows error when push is rejected due to diverged remote', async ({ page }) => {
    initGitWithRemote(currentWorkspace!, currentRemoteDir!)

    const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindstack-e2e-clone-'))
    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
      cp.execFileSync('git', ['clone', currentRemoteDir!, cloneDir], { env: GIT_ENV })
      fs.appendFileSync(path.join(cloneDir, 'readme.md'), '\n\nremote ahead\n')
      cp.execFileSync('git', ['add', '-A'], { cwd: cloneDir })
      cp.execFileSync('git', ['commit', '-m', 'remote ahead'], { cwd: cloneDir, env: GIT_ENV })
      cp.execFileSync('git', ['push'], { cwd: cloneDir, env: GIT_ENV })
    } finally {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    fs.appendFileSync(path.join(currentWorkspace!, 'readme.md'), '\n\nlocal behind\n')
    cp.execFileSync('git', ['add', '-A'], { cwd: currentWorkspace! })
    cp.execFileSync('git', ['commit', '-m', 'local behind'], { cwd: currentWorkspace!, env: GIT_ENV })

    await openWorkspace(page, currentWorkspace!)
    await waitForTreeReady(page)

    await page.evaluate(() => (window as any).__handleGitPush())

    await expect(page.locator('[data-testid="git-status"]')).toContainText('Git 错误', { timeout: 15000 })
    await expect.poll(async () => (await getGitStatus(page)).error).toContain('Git 错误', { timeout: 15000 })
  })
})
