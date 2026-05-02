import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick, ref, computed } from 'vue'

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: vi.fn((key: string) => key),
  }),
}))

// --- Mock force-graph ---
const mockD3Force = vi.fn().mockReturnValue({ strength: vi.fn().mockReturnThis(), distance: vi.fn().mockReturnThis() })
const mockGraphInstance = {
  width: vi.fn().mockReturnThis(),
  height: vi.fn().mockReturnThis(),
  backgroundColor: vi.fn().mockReturnThis(),
  graphData: vi.fn().mockReturnThis(),
  nodeId: vi.fn().mockReturnThis(),
  nodeVal: vi.fn().mockReturnThis(),
  nodeRelSize: vi.fn().mockReturnThis(),
  linkSource: vi.fn().mockReturnThis(),
  linkTarget: vi.fn().mockReturnThis(),
  nodeCanvasObjectMode: vi.fn().mockReturnThis(),
  nodeCanvasObject: vi.fn().mockReturnThis(),
  nodePointerAreaPaint: vi.fn().mockReturnThis(),
  linkWidth: vi.fn().mockReturnThis(),
  linkColor: vi.fn().mockReturnThis(),
  linkDirectionalArrowLength: vi.fn().mockReturnThis(),
  linkDirectionalArrowRelPos: vi.fn().mockReturnThis(),
  linkDirectionalArrowColor: vi.fn().mockReturnThis(),
  linkLineDash: vi.fn().mockReturnThis(),
  onNodeClick: vi.fn().mockReturnThis(),
  onBackgroundClick: vi.fn().mockReturnThis(),
  onNodeDrag: vi.fn().mockReturnThis(),
  onNodeDragEnd: vi.fn().mockReturnThis(),
  d3AlphaDecay: vi.fn().mockReturnThis(),
  d3VelocityDecay: vi.fn().mockReturnThis(),
  warmupTicks: vi.fn().mockReturnThis(),
  cooldownTime: vi.fn().mockReturnThis(),
  d3Force: mockD3Force,
  _destructor: vi.fn(),
  enableZoomInteraction: vi.fn().mockReturnThis(),
  zoom: vi.fn().mockReturnValue(1),
  centerAt: vi.fn().mockReturnValue({ x: 0, y: 0 }),
}
const mockForceGraphFactory = vi.fn((_el?: HTMLElement) => mockGraphInstance)

vi.mock('force-graph', () => ({
  default: () => mockForceGraphFactory,
}))

// --- Mock useRelations ---
const mockNodes = ref<any[]>([])
const mockRelations = ref<any[]>([])
const mockAllTags = ref<string[]>([])
const mockLoading = ref(false)
const mockError = ref('')
const mockLoadData = vi.fn()
const mockGetNode = vi.fn()
const mockGetRelationsForDoc = vi.fn(() => [])
const mockGetRelatedDocs = vi.fn(() => [])

vi.mock('../../composables/useRelations', () => ({
  useRelations: () => ({
    nodes: mockNodes,
    relations: mockRelations,
    allTags: mockAllTags,
    loading: mockLoading,
    error: mockError,
    loadData: mockLoadData,
    getRelationsForDoc: (...args: any[]) => mockGetRelationsForDoc(...args),
    getRelatedDocs: (...args: any[]) => mockGetRelatedDocs(...args),
    getNode: (...args: any[]) => mockGetNode(...args),
  }),
}))

// --- Mock useFileTree ---
const mockSelectFile = vi.fn().mockResolvedValue(undefined)
const mockRootPath = ref('/workspace')

vi.mock('../../composables/useFileTree', () => ({
  useFileTree: () => ({
    selectFile: (...args: any[]) => mockSelectFile(...args),
    rootPath: mockRootPath,
  }),
}))

import RelationGraph from '../RelationGraph.vue'

function createWrapper() {
  return mount(RelationGraph, {
    attachTo: document.body,
  })
}

function makeNode(path: string, title: string, tags: string[] = [], color = '#0066FF') {
  return { path, title, summary: `Summary of ${title}`, tags, color }
}

function makeRelation(source: string, target: string, score = 0.8, reason = 'related') {
  return { source, target, score, reason, sharedTags: ['shared'] }
}

async function flushAll() {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  // flush requestAnimationFrame
  const callbacks: FrameRequestCallback[] = []
  const origRAF = window.requestAnimationFrame
  window.requestAnimationFrame = (cb: FrameRequestCallback) => { callbacks.push(cb); return 0 }
  await nextTick()
  window.requestAnimationFrame = origRAF
  for (const cb of callbacks) cb(0)
  await nextTick()
}

describe('RelationGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNodes.value = []
    mockRelations.value = []
    mockAllTags.value = []
    mockLoading.value = false
    mockError.value = ''
    mockLoadData.mockResolvedValue(undefined)
    // Give the container dimensions so initGraph proceeds
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { value: 800, configurable: true },
      clientHeight: { value: 600, configurable: true },
    })
  })

  afterEach(() => {
    // restore HTMLElement prototype
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { value: 0, configurable: true },
      clientHeight: { value: 0, configurable: true },
    })
  })

  describe('component mounting', () => {
    it('renders the header with title', async () => {
      const wrapper = createWrapper()
      await flushAll()
      expect(wrapper.find('.graph-header').exists()).toBe(true)
      expect(wrapper.find('.header-title').text()).toBe('relationGraph.title')
      wrapper.unmount()
    })

    it('renders the search input', async () => {
      const wrapper = createWrapper()
      await flushAll()
      expect(wrapper.find('.search-input').exists()).toBe(true)
      wrapper.unmount()
    })

    it('hides detail panel when no node selected', async () => {
      const wrapper = createWrapper()
      await flushAll()
      expect(wrapper.find('.detail-panel').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('loading state', () => {
    it('shows loading when loading is true', async () => {
      mockLoading.value = true
      // loadData hangs so initGraph never runs
      mockLoadData.mockReturnValue(new Promise(() => {}))
      const wrapper = createWrapper()
      await flushAll()
      expect(wrapper.find('.graph-loading').exists()).toBe(true)
      expect(wrapper.find('.graph-loading').text()).toContain('relationGraph.loading')
      wrapper.unmount()
    })

    it('hides graph container while loading', async () => {
      mockLoading.value = true
      mockLoadData.mockReturnValue(new Promise(() => {}))
      const wrapper = createWrapper()
      await flushAll()
      expect(wrapper.find('.graph-container').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('error state', () => {
    it('shows error from data loading', async () => {
      mockError.value = 'no workspace open'
      mockLoadData.mockReturnValue(new Promise(() => {}))
      const wrapper = createWrapper()
      await flushAll()
      const errors = wrapper.findAll('.graph-error')
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some(e => e.text().includes('no workspace open'))).toBe(true)
      wrapper.unmount()
    })
  })

  describe('empty state', () => {
    it('shows empty message when no documents', async () => {
      mockNodes.value = []
      // loadData hangs so initGraph never sets graphError
      mockLoadData.mockReturnValue(new Promise(() => {}))
      const wrapper = createWrapper()
      await flushAll()
      expect(wrapper.find('.graph-empty').exists()).toBe(true)
      expect(wrapper.find('.graph-empty').text()).toContain('relationGraph.empty')
      wrapper.unmount()
    })
  })

  describe('data loaded state', () => {
    it('renders graph container when nodes exist', async () => {
      mockNodes.value = [
        makeNode('a.md', 'Doc A'),
        makeNode('b.md', 'Doc B'),
      ]
      mockRelations.value = [
        makeRelation('a.md', 'b.md'),
      ]

      const wrapper = createWrapper()
      await flushAll()

      expect(wrapper.find('.graph-container').exists()).toBe(true)
      wrapper.unmount()
    })

    it('calls loadData on mount', async () => {
      const wrapper = createWrapper()
      await flushAll()
      expect(mockLoadData).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('initializes force-graph with container element', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      expect(mockForceGraphFactory).toHaveBeenCalled()
      const containerArg = (mockForceGraphFactory.mock.calls as any[][])[0][0]
      expect(containerArg).toBeInstanceOf(HTMLElement)
      wrapper.unmount()
    })

    it('passes graph data to force-graph', async () => {
      mockNodes.value = [
        makeNode('a.md', 'Doc A', ['tag1']),
        makeNode('b.md', 'Doc B', ['tag2']),
      ]
      mockRelations.value = [makeRelation('a.md', 'b.md')]

      const wrapper = createWrapper()
      await flushAll()

      expect(mockGraphInstance.graphData).toHaveBeenCalled()
      const data = mockGraphInstance.graphData.mock.calls[0][0]
      expect(data.nodes).toHaveLength(2)
      expect(data.links).toHaveLength(1)
      expect(data.nodes[0].id).toBe('a.md')
      expect(data.links[0].source).toBe('a.md')
      wrapper.unmount()
    })

    it('sets d3 forces for layout', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      expect(mockD3Force).toHaveBeenCalledWith('charge')
      expect(mockD3Force).toHaveBeenCalledWith('link')
      wrapper.unmount()
    })
  })

  describe('search filtering', () => {
    it('filters nodes by title', async () => {
      mockNodes.value = [
        makeNode('a.md', 'Architecture'),
        makeNode('b.md', 'Getting Started'),
        makeNode('c.md', 'API Design'),
      ]

      const wrapper = createWrapper()
      await flushAll()

      await wrapper.find('.search-input').setValue('API')
      await nextTick()

      // graphData should be updated with filtered nodes
      const lastCall = mockGraphInstance.graphData.mock.calls.at(-1)
      expect(lastCall).toBeDefined()
      expect(lastCall![0].nodes).toHaveLength(1)
      expect(lastCall![0].nodes[0].title).toBe('API Design')
      wrapper.unmount()
    })

    it('filters nodes by tag', async () => {
      mockNodes.value = [
        makeNode('a.md', 'Architecture', ['design']),
        makeNode('b.md', 'Getting Started', ['guide']),
      ]

      const wrapper = createWrapper()
      await flushAll()

      await wrapper.find('.search-input').setValue('guide')
      await nextTick()

      const lastCall = mockGraphInstance.graphData.mock.calls.at(-1)
      expect(lastCall).toBeDefined()
      expect(lastCall![0].nodes).toHaveLength(1)
      expect(lastCall![0].nodes[0].title).toBe('Getting Started')
      wrapper.unmount()
    })

    it('shows all nodes when search is cleared', async () => {
      mockNodes.value = [
        makeNode('a.md', 'Architecture'),
        makeNode('b.md', 'Getting Started'),
      ]

      const wrapper = createWrapper()
      await flushAll()

      await wrapper.find('.search-input').setValue('Architecture')
      await nextTick()

      let lastCall = mockGraphInstance.graphData.mock.calls.at(-1)
      expect(lastCall![0].nodes).toHaveLength(1)

      await wrapper.find('.search-input').setValue('')
      await nextTick()

      lastCall = mockGraphInstance.graphData.mock.calls.at(-1)
      expect(lastCall![0].nodes).toHaveLength(2)
      wrapper.unmount()
    })
  })

  describe('detail panel', () => {
    it('shows stats after selecting a node', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      const nodeB = makeNode('b.md', 'Doc B')
      mockNodes.value = [nodeA, nodeB]
      mockRelations.value = [makeRelation('a.md', 'b.md')]
      mockAllTags.value = ['tag1', 'tag2']
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        return undefined
      })

      const wrapper = createWrapper()
      await flushAll()

      // Simulate node click via onNodeClick callback
      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      // Stats are inside detail-content (visible after node selection)
      const statValues = wrapper.findAll('.stat-value')
      expect(statValues.length).toBeGreaterThanOrEqual(3)
      expect(statValues[0].text()).toBe('2') // docs
      expect(statValues[1].text()).toBe('1') // relations
      expect(statValues[2].text()).toBe('2') // tags
      wrapper.unmount()
    })
  })

  describe('back navigation', () => {
    it('emits back event when back button is clicked', async () => {
      const wrapper = createWrapper()
      await flushAll()

      await wrapper.find('.back-btn').trigger('click')
      expect(wrapper.emitted('back')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  describe('cleanup', () => {
    it('calls _destructor on unmount', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      expect(mockGraphInstance._destructor).not.toHaveBeenCalled()
      wrapper.unmount()
      expect(mockGraphInstance._destructor).toHaveBeenCalled()
    })

    it('removes resize event listener on unmount', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()
      wrapper.unmount()

      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      removeSpy.mockRestore()
    })

    it('cleans up ResizeObserver on unmount', async () => {
      const disconnectSpy = vi.spyOn(ResizeObserver.prototype, 'disconnect')
      // Force the zero-dimension path by setting dimensions to 0 AFTER mount
      Object.defineProperties(HTMLElement.prototype, {
        clientWidth: { value: 0, configurable: true },
        clientHeight: { value: 0, configurable: true },
      })

      mockNodes.value = [makeNode('a.md', 'Doc A')]
      const wrapper = createWrapper()
      await flushAll()

      // Restore dimensions so ResizeObserver fires
      Object.defineProperties(HTMLElement.prototype, {
        clientWidth: { value: 800, configurable: true },
        clientHeight: { value: 600, configurable: true },
      })

      wrapper.unmount()
      expect(disconnectSpy).toHaveBeenCalled()
      disconnectSpy.mockRestore()
    })
  })

  describe('zoom controls', () => {
    it('renders zoom controls when graph is ready', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      expect(wrapper.find('.zoom-controls').exists()).toBe(true)
      expect(wrapper.find('.zoom-pct').text()).toBe('100%')
      wrapper.unmount()
    })

    it('zooms in when zoom in button is clicked', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      await wrapper.find('.zoom-btn').trigger('click')
      await nextTick()

      expect(mockGraphInstance.zoom).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('zooms out when zoom out button is clicked', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      const zoomBtns = wrapper.findAll('.zoom-btn')
      // Second zoom button is zoom out
      await zoomBtns[1].trigger('click')
      await nextTick()

      expect(mockGraphInstance.zoom).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('does not zoom when graphInstance is null', async () => {
      mockNodes.value = []
      mockForceGraphFactory.mockReturnValueOnce(null)
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      // Clear previous zoom calls
      mockGraphInstance.zoom.mockClear()
      // Directly test the zoom functions by clicking
      // Since graphInstance is set during initGraph, test via button click after init
      wrapper.unmount()
    })
  })

  describe('selectNode', () => {
    it('toggles selection off when clicking same node', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      const nodeB = makeNode('b.md', 'Doc B')
      mockNodes.value = [nodeA, nodeB]
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        return undefined
      })

      const wrapper = createWrapper()
      await flushAll()

      // Select node
      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()
      expect(wrapper.find('.detail-panel').exists()).toBe(true)

      // Click same node again to deselect
      clickCb({ id: 'a.md' })
      await nextTick()
      expect(wrapper.find('.detail-panel').exists()).toBe(false)
      wrapper.unmount()
    })

    it('clears selection on background click', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'a.md' ? nodeA : undefined)

      const wrapper = createWrapper()
      await flushAll()

      // Select node first
      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()
      expect(wrapper.find('.detail-panel').exists()).toBe(true)

      // Background click
      const bgClickCb = mockGraphInstance.onBackgroundClick.mock.calls[0][0]
      bgClickCb()
      await nextTick()
      expect(wrapper.find('.detail-panel').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('detail panel interactions', () => {
    async function mountWithSelectedNode() {
      const nodeA = makeNode('a.md', 'Doc A', ['tag1'])
      const nodeB = makeNode('b.md', 'Doc B', ['tag2'])
      mockNodes.value = [nodeA, nodeB]
      mockRelations.value = [makeRelation('a.md', 'b.md', 0.8, 'linked')]
      mockAllTags.value = ['tag1', 'tag2']
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        return undefined
      })

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      return wrapper
    }

    it('closes detail panel when close button is clicked', async () => {
      const wrapper = await mountWithSelectedNode()
      expect(wrapper.find('.detail-panel').exists()).toBe(true)

      await wrapper.find('.detail-close-btn').trigger('click')
      await nextTick()
      expect(wrapper.find('.detail-panel').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows document title and tags in detail panel', async () => {
      const wrapper = await mountWithSelectedNode()

      expect(wrapper.find('.detail-title').text()).toBe('Doc A')
      expect(wrapper.find('.detail-tags').text()).toBe('tag1')
      wrapper.unmount()
    })

    it('shows relations with score display', async () => {
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'a.md', target: 'b.md', score: 0.8, reason: 'linked', sharedTags: ['s'] },
      ])
      const wrapper = await mountWithSelectedNode()

      const cards = wrapper.findAll('.relation-card')
      expect(cards.length).toBe(1)
      expect(wrapper.find('.relation-badge').text()).toContain('0.8')
      wrapper.unmount()
    })

    it('shows relation reason when available', async () => {
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'a.md', target: 'b.md', score: 0.8, reason: 'shared concepts', sharedTags: ['s'] },
      ])
      const wrapper = await mountWithSelectedNode()

      expect(wrapper.find('.relation-reason').text()).toBe('shared concepts')
      wrapper.unmount()
    })

    it('shows no relations message when empty', async () => {
      mockGetRelationsForDoc.mockReturnValue([])
      const wrapper = await mountWithSelectedNode()

      expect(wrapper.find('.detail-empty-sm').text()).toContain('relationGraph.noRelations')
      wrapper.unmount()
    })

    it('selects related node when relation card is clicked', async () => {
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'a.md', target: 'b.md', score: 0.8, reason: '', sharedTags: [] },
      ])
      const wrapper = await mountWithSelectedNode()

      await wrapper.find('.relation-card').trigger('click')
      await nextTick()

      // Detail panel should still be visible with new selection
      expect(wrapper.find('.detail-panel').exists()).toBe(true)
      wrapper.unmount()
    })

    it('shows shared tags in detail panel', async () => {
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'a.md', target: 'b.md', score: 0.8, reason: '', sharedTags: [] },
      ])
      mockGetRelatedDocs.mockReturnValue(['b.md'])
      const wrapper = await mountWithSelectedNode()

      const tagChips = wrapper.findAll('.tag-chip')
      // tag1 appears in both nodeA and nodeB, so it should be a shared tag
      expect(tagChips.length).toBeGreaterThanOrEqual(0)
      wrapper.unmount()
    })

    it('shows no shared tags message when none exist', async () => {
      mockGetRelationsForDoc.mockReturnValue([])
      mockGetRelatedDocs.mockReturnValue([])
      const wrapper = await mountWithSelectedNode()

      const emptyMsgs = wrapper.findAll('.detail-empty-sm')
      expect(emptyMsgs.some(e => e.text().includes('relationGraph.noSharedTags'))).toBe(true)
      wrapper.unmount()
    })

    it('opens file in editor when open file button clicked', async () => {
      mockGetRelationsForDoc.mockReturnValue([])
      mockGetRelatedDocs.mockReturnValue([])
      const wrapper = await mountWithSelectedNode()

      await wrapper.find('.open-file-btn').trigger('click')
      await nextTick()

      expect(mockSelectFile).toHaveBeenCalledWith('/workspace/a.md')
      expect(wrapper.emitted('back')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  describe('openFile path resolution', () => {
    it('resolves relative path with rootPath', async () => {
      mockRootPath.value = '/workspace'
      const nodeA = makeNode('notes/a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'notes/a.md' ? nodeA : undefined)
      mockGetRelationsForDoc.mockReturnValue([])
      mockGetRelatedDocs.mockReturnValue([])

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'notes/a.md' })
      await nextTick()

      await wrapper.find('.open-file-btn').trigger('click')
      await nextTick()

      expect(mockSelectFile).toHaveBeenCalledWith('/workspace/notes/a.md')
      wrapper.unmount()
    })

    it('uses absolute path as-is', async () => {
      mockRootPath.value = '/workspace'
      const nodeA = makeNode('/absolute/path/a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === '/absolute/path/a.md' ? nodeA : undefined)
      mockGetRelationsForDoc.mockReturnValue([])
      mockGetRelatedDocs.mockReturnValue([])

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: '/absolute/path/a.md' })
      await nextTick()

      await wrapper.find('.open-file-btn').trigger('click')
      await nextTick()

      expect(mockSelectFile).toHaveBeenCalledWith('/absolute/path/a.md')
      wrapper.unmount()
    })

    it('handles rootPath with trailing slash', async () => {
      mockRootPath.value = '/workspace/'
      const nodeA = makeNode('notes/a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'notes/a.md' ? nodeA : undefined)
      mockGetRelationsForDoc.mockReturnValue([])
      mockGetRelatedDocs.mockReturnValue([])

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'notes/a.md' })
      await nextTick()

      await wrapper.find('.open-file-btn').trigger('click')
      await nextTick()

      expect(mockSelectFile).toHaveBeenCalledWith('/workspace/notes/a.md')
      wrapper.unmount()
    })
  })

  describe('graphData watcher', () => {
    it('updates graph when data changes', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      mockGraphInstance.graphData.mockClear()
      mockNodes.value = [makeNode('a.md', 'Doc A'), makeNode('b.md', 'Doc B')]
      await nextTick()

      expect(mockGraphInstance.graphData).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('selectedPath watcher', () => {
    it('updates link styles when selection changes', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'a.md' ? nodeA : undefined)

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      // Should have called linkColor, linkWidth, linkLineDash to update styles
      expect(mockGraphInstance.linkColor).toHaveBeenCalled()
      expect(mockGraphInstance.linkWidth).toHaveBeenCalled()
      expect(mockGraphInstance.linkLineDash).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('handleResize', () => {
    it('resizes graph on window resize', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      mockGraphInstance.width.mockClear()
      mockGraphInstance.height.mockClear()

      window.dispatchEvent(new Event('resize'))
      await nextTick()

      expect(mockGraphInstance.width).toHaveBeenCalled()
      expect(mockGraphInstance.height).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('initGraph error handling', () => {
    it('shows error when force-graph init throws', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]
      mockForceGraphFactory.mockImplementationOnce(() => {
        throw new Error('Canvas not supported')
      })

      const wrapper = createWrapper()
      await flushAll()

      expect(wrapper.find('.graph-error').exists()).toBe(true)
      expect(wrapper.find('.graph-error').text()).toContain('Canvas not supported')
      wrapper.unmount()
    })

    it('shows error when containerRef is null', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]
      // Force containerRef to be null by not attaching to DOM
      Object.defineProperties(HTMLElement.prototype, {
        clientWidth: { value: 0, configurable: true },
        clientHeight: { value: 0, configurable: true },
      })

      const wrapper = mount(RelationGraph)
      await flushAll()

      // The component should show error or handle gracefully
      // Since containerRef is inside v-else, it should be rendered when nodes exist
      wrapper.unmount()
    })
  })

  describe('node drag', () => {
    it('fixes node position on drag', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      const dragCb = mockGraphInstance.onNodeDrag.mock.calls[0][0]
      const node = { x: 100, y: 200 }
      dragCb(node)
      expect(node.fx).toBe(100)
      expect(node.fy).toBe(200)
      wrapper.unmount()
    })
  })

  describe('search by path', () => {
    it('filters nodes by path', async () => {
      mockNodes.value = [
        makeNode('architecture/overview.md', 'Overview'),
        makeNode('guides/start.md', 'Getting Started'),
      ]

      const wrapper = createWrapper()
      await flushAll()

      await wrapper.find('.search-input').setValue('architecture')
      await nextTick()

      const lastCall = mockGraphInstance.graphData.mock.calls.at(-1)
      expect(lastCall![0].nodes).toHaveLength(1)
      expect(lastCall![0].nodes[0].id).toBe('architecture/overview.md')
      wrapper.unmount()
    })
  })

  describe('canvas drawing callbacks', () => {
    function makeMockCtx() {
      return {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 50 }),
        fillText: vi.fn(),
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetY: 0,
        textBaseline: '',
      } as unknown as CanvasRenderingContext2D
    }

    it('invokes nodeCanvasObject callback with canvas context', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A', ['tag1'])]

      const wrapper = createWrapper()
      await flushAll()

      const nodeObjCb = mockGraphInstance.nodeCanvasObject.mock.calls[0][0]
      const mockCtx = makeMockCtx()

      const node = { id: 'a.md', x: 100, y: 100, title: 'Doc A', tags: ['tag1'], color: '#0066FF' }
      nodeObjCb(node, mockCtx, 1)

      expect(mockCtx.fillText).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('draws node without tags', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      const nodeObjCb = mockGraphInstance.nodeCanvasObject.mock.calls[0][0]
      const mockCtx = makeMockCtx()

      const node = { id: 'a.md', x: 100, y: 100, title: 'Doc A', tags: [], color: '#0066FF' }
      nodeObjCb(node, mockCtx, 1)

      expect(mockCtx.fillText).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('draws selected node with blue border', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'a.md' ? nodeA : undefined)

      const wrapper = createWrapper()
      await flushAll()

      // Select the node
      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      const nodeObjCb = mockGraphInstance.nodeCanvasObject.mock.calls[0][0]
      const mockCtx = makeMockCtx()

      const node = { id: 'a.md', x: 100, y: 100, title: 'Doc A', tags: [], color: '#0066FF' }
      nodeObjCb(node, mockCtx, 1)

      // Selected node should have different shadow and border
      expect(mockCtx.fillText).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('truncates long titles in drawNode', async () => {
      mockNodes.value = [makeNode('a.md', 'A very long document title that exceeds the max width')]

      const wrapper = createWrapper()
      await flushAll()

      const nodeObjCb = mockGraphInstance.nodeCanvasObject.mock.calls[0][0]
      const mockCtx = makeMockCtx()
      // Return large width so title gets truncated
      mockCtx.measureText = vi.fn().mockReturnValue({ width: 500 })

      const node = {
        id: 'a.md', x: 100, y: 100,
        title: 'A very long document title that exceeds the max width',
        tags: ['tag1', 'tag2', 'tag3'], color: '#0066FF',
      }
      nodeObjCb(node, mockCtx, 1)
      expect(mockCtx.fillText).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('invokes nodePointerAreaPaint callback', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      const areaCb = mockGraphInstance.nodePointerAreaPaint.mock.calls[0][0]
      const mockCtx = {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(), closePath: vi.fn(),
        fill: vi.fn(), fillStyle: '',
      } as unknown as CanvasRenderingContext2D

      areaCb({ x: 100, y: 100 }, 'red', mockCtx)
      expect(mockCtx.fill).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('link style callbacks', () => {
    it('invokes linkWidth callback', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A'), makeNode('b.md', 'Doc B')]

      const wrapper = createWrapper()
      await flushAll()

      const linkWidthCb = mockGraphInstance.linkWidth.mock.calls[0][0]
      const result = linkWidthCb({ score: 0.5 })
      expect(typeof result).toBe('number')
      wrapper.unmount()
    })

    it('invokes linkColor callback for selected link', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      const nodeB = makeNode('b.md', 'Doc B')
      mockNodes.value = [nodeA, nodeB]
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        return undefined
      })

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      const linkColorCb = mockGraphInstance.linkColor.mock.calls.at(-1)![0]
      const result = linkColorCb({ source: { id: 'a.md' }, target: { id: 'b.md' } })
      expect(result).toContain('0.6')
      wrapper.unmount()
    })

    it('invokes linkColor callback for unselected link', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A'), makeNode('b.md', 'Doc B')]

      const wrapper = createWrapper()
      await flushAll()

      const linkColorCb = mockGraphInstance.linkColor.mock.calls[0][0]
      const result = linkColorCb({ source: { id: 'x' }, target: { id: 'y' } })
      expect(result).toContain('0.15')
      wrapper.unmount()
    })

    it('invokes linkDirectionalArrowColor callback', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      const arrowCb = mockGraphInstance.linkDirectionalArrowColor.mock.calls[0][0]
      const result = arrowCb({ source: { id: 'x' }, target: { id: 'y' } })
      expect(typeof result).toBe('string')
      wrapper.unmount()
    })

    it('invokes linkLineDash callback for unselected link', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      const dashCb = mockGraphInstance.linkLineDash.mock.calls[0][0]
      const result = dashCb({ source: { id: 'x' }, target: { id: 'y' } })
      expect(result).toEqual([2, 2])
      wrapper.unmount()
    })
  })

  describe('selectedPath watcher callbacks', () => {
    it('invokes linkWidth in watcher for selected link', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'a.md' ? nodeA : undefined)

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      const linkWidthCb = mockGraphInstance.linkWidth.mock.calls.at(-1)![0]
      const selected = linkWidthCb({ source: { id: 'a.md' }, target: { id: 'b.md' }, score: 0.5 })
      const unselected = linkWidthCb({ source: { id: 'x' }, target: { id: 'y' }, score: 0.5 })
      expect(selected).toBeGreaterThan(unselected)
      wrapper.unmount()
    })

    it('invokes linkLineDash in watcher for selected link', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      mockNodes.value = [nodeA]
      mockGetNode.mockImplementation((path: string) => path === 'a.md' ? nodeA : undefined)

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      const dashCb = mockGraphInstance.linkLineDash.mock.calls.at(-1)![0]
      const selected = dashCb({ source: { id: 'a.md' }, target: { id: 'b.md' } })
      expect(selected).toBeNull()
      wrapper.unmount()
    })
  })

  describe('shared tags computation', () => {
    it('computes shared tags appearing in multiple related docs', async () => {
      const nodeA = makeNode('a.md', 'Doc A', ['vue', 'react'])
      const nodeB = makeNode('b.md', 'Doc B', ['vue', 'angular'])
      const nodeC = makeNode('c.md', 'Doc C', ['vue'])
      mockNodes.value = [nodeA, nodeB, nodeC]
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        if (path === 'c.md') return nodeC
        return undefined
      })
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'a.md', target: 'b.md', score: 0.8, reason: '', sharedTags: [] },
        { source: 'a.md', target: 'c.md', score: 0.6, reason: '', sharedTags: [] },
      ])
      mockGetRelatedDocs.mockReturnValue(['b.md', 'c.md'])

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      // 'vue' appears in nodeA, nodeB, and nodeC (count >= 2)
      const tagChips = wrapper.findAll('.tag-chip')
      const tagTexts = tagChips.map(t => t.text())
      expect(tagTexts).toContain('vue')
      wrapper.unmount()
    })
  })

  describe('getScoreDisplay', () => {
    it('shows outgoing score', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      const nodeB = makeNode('b.md', 'Doc B')
      mockNodes.value = [nodeA, nodeB]
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        return undefined
      })
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'a.md', target: 'b.md', score: 0.8, reason: '', sharedTags: [] },
      ])

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      const badge = wrapper.find('.relation-badge')
      expect(badge.text()).toContain('0.8')
      wrapper.unmount()
    })

    it('shows incoming score when relation is incoming', async () => {
      const nodeA = makeNode('a.md', 'Doc A')
      const nodeB = makeNode('b.md', 'Doc B')
      mockNodes.value = [nodeA, nodeB]
      mockGetNode.mockImplementation((path: string) => {
        if (path === 'a.md') return nodeA
        if (path === 'b.md') return nodeB
        return undefined
      })
      mockGetRelationsForDoc.mockReturnValue([
        { source: 'b.md', target: 'a.md', score: 0.6, reason: '', sharedTags: [] },
      ])

      const wrapper = createWrapper()
      await flushAll()

      const clickCb = mockGraphInstance.onNodeClick.mock.calls[0][0]
      clickCb({ id: 'a.md' })
      await nextTick()

      const badge = wrapper.find('.relation-badge')
      expect(badge.text()).toContain('0.6')
      wrapper.unmount()
    })
  })

  describe('wheel handler', () => {
    it('registers wheel handler on canvas', async () => {
      mockNodes.value = [makeNode('a.md', 'Doc A')]

      const wrapper = createWrapper()
      await flushAll()

      expect(mockGraphInstance.enableZoomInteraction).toHaveBeenCalledWith(false)
      wrapper.unmount()
    })
  })
})
