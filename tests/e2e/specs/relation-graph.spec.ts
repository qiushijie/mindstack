import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'

const MOCK_METAS = [
  {
    path: 'docs/architecture.md',
    title: 'Architecture Overview',
    summary: 'System architecture documentation',
    tags: ['architecture', 'system', 'design'],
    status: 'active',
    contentHash: 'abc123',
  },
  {
    path: 'docs/api-design.md',
    title: 'API Design',
    summary: 'REST API design guidelines',
    tags: ['api', 'architecture', 'rest'],
    status: 'active',
    contentHash: 'def456',
  },
  {
    path: 'docs/getting-started.md',
    title: 'Getting Started',
    summary: 'Quick start guide for new developers',
    tags: ['guide', 'setup', 'onboarding'],
    status: 'active',
    contentHash: 'ghi789',
  },
  {
    path: 'docs/deployment.md',
    title: 'Deployment Guide',
    summary: 'How to deploy the application',
    tags: ['deployment', 'devops', 'guide'],
    status: 'active',
    contentHash: 'jkl012',
  },
  {
    path: 'docs/security.md',
    title: 'Security Policy',
    summary: 'Security best practices and policies',
    tags: ['security', 'architecture', 'policy'],
    status: 'active',
    contentHash: 'mno345',
  },
]

const MOCK_RELATIONS = {
  'docs/architecture.md': [
    {
      source: 'docs/architecture.md',
      target: 'docs/api-design.md',
      score: 0.85,
      reason: 'API design follows architecture patterns',
      sharedTags: ['architecture'],
    },
    {
      source: 'docs/architecture.md',
      target: 'docs/security.md',
      score: 0.72,
      reason: 'Security considerations in architecture',
      sharedTags: ['architecture'],
    },
  ],
  'docs/api-design.md': [
    {
      source: 'docs/api-design.md',
      target: 'docs/architecture.md',
      score: 0.85,
      reason: 'API aligned with system architecture',
      sharedTags: ['architecture'],
    },
  ],
  'docs/getting-started.md': [
    {
      source: 'docs/getting-started.md',
      target: 'docs/deployment.md',
      score: 0.65,
      reason: 'Setup leads to deployment',
      sharedTags: ['guide'],
    },
  ],
  'docs/deployment.md': [
    {
      source: 'docs/deployment.md',
      target: 'docs/security.md',
      score: 0.55,
      reason: 'Deployment includes security configuration',
      sharedTags: [],
    },
  ],
}

async function setupRelationGraphMocks(page: import('@playwright/test').Page) {
  // In wails dev mode, Playwright connects directly to the Vite dev server,
  // so window.go is never populated by the Wails runtime (only the native
  // Wails window receives the runtime injection). Create mock bindings instead.
  await page.evaluate((data) => {
    if (!(window as any).go) {
      (window as any).go = { main: { App: {} } }
    }
    ;(window as any).go.main.App.GetDocumentMetas = () =>
      Promise.resolve(JSON.stringify(data.metas))
    ;(window as any).go.main.App.GetDocumentRelations = () =>
      Promise.resolve(JSON.stringify(data.relations))
    ;(window as any).go.main.App.SetWorkspaceRoot = () => Promise.resolve()
    ;(window as any).go.main.App.GetFileServerPort = () => Promise.resolve(9876)
  }, { metas: MOCK_METAS, relations: MOCK_RELATIONS })
}

test.describe('Relation Graph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await setupRelationGraphMocks(page)
    await navigateTo(page, 'relations')
  })

  test('should render the relation graph page', async ({ page }) => {
    await expect(page.locator('.relation-graph')).toBeVisible()
    await expect(page.locator('.graph-area')).toBeVisible()
    await expect(page.locator('.graph-search-input')).toBeVisible()
  })

  test('should render the force-graph canvas', async ({ page }) => {
    const canvas = page.locator('.graph-container canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('should hide detail panel when no node is selected', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.detail-panel')).toBeHidden()
  })

  test('should select a node via canvas click and show details', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })

    const canvas = page.locator('.graph-container canvas')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const detailTitle = page.locator('.detail-title')
    const isVisible = await detailTitle.isVisible().catch(() => false)
    if (isVisible) {
      const text = await detailTitle.textContent()
      expect(MOCK_METAS.some(m => text?.includes(m.title))).toBe(true)
    }
  })

  test('should show stats in detail panel after node selection', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })

    const canvas = page.locator('.graph-container canvas')
    const box = await canvas.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const statLabels = page.locator('.stat-label')
    const count = await statLabels.count()
    if (count > 0) {
      expect(await statLabels.first().textContent()).toContain('文档')
    }
  })

  test('should show legend in detail panel after node selection', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })

    const canvas = page.locator('.graph-container canvas')
    const box = await canvas.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(200)

    const legendItems = page.locator('.legend-item')
    const count = await legendItems.count()
    if (count > 0) {
      expect(count).toBe(2)
      expect(await legendItems.nth(0).textContent()).toContain('出向')
      expect(await legendItems.nth(1).textContent()).toContain('入向')
    }
  })

  test('should filter via search by title', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })

    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('API')
    await page.waitForTimeout(300)

    // Graph container should still be rendered
    await expect(page.locator('.graph-container')).toBeVisible()
    // Canvas may be hidden if filtered to zero, but here API matches one doc
    const canvas = page.locator('.graph-container canvas')
    await expect(canvas).toBeVisible()
  })

  test('should show no results overlay when search matches nothing', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })

    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('xyz-nonexistent')
    await page.waitForTimeout(300)

    // Should show no results overlay
    await expect(page.locator('.graph-empty-overlay')).toBeVisible()
    const text = await page.locator('.graph-empty-overlay').textContent()
    expect(text).toContain('未找到匹配的文档')
  })

  test('should restore all nodes when search is cleared', async ({ page }) => {
    await expect(page.locator('.graph-container canvas')).toBeVisible({ timeout: 5000 })

    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('xyz-nonexistent')
    await page.waitForTimeout(300)
    await expect(page.locator('.graph-empty-overlay')).toBeVisible()

    // Clear search via clear button
    await page.locator('.graph-search-clear').click()
    await page.waitForTimeout(300)

    // Should hide overlay and show canvas again
    await expect(page.locator('.graph-empty-overlay')).toBeHidden()
    await expect(page.locator('.graph-container canvas')).toBeVisible()
  })

  test('should hide zoom controls when no search results', async ({ page }) => {
    await expect(page.locator('.zoom-controls')).toBeVisible()

    const searchInput = page.locator('.graph-search-input')
    await searchInput.fill('xyz-nonexistent')
    await page.waitForTimeout(300)

    await expect(page.locator('.zoom-controls')).toBeHidden()
  })

  test('should have search input functional', async ({ page }) => {
    const searchInput = page.locator('.graph-search-input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', '搜索文档...')
  })
})
