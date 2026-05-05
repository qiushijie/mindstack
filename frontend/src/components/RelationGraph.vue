<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import ForceGraphModule from 'force-graph'
import { useRelations, type DocNode, type RelationEdge } from '../composables/useRelations'
import { useFileTree } from '../composables/useFileTree'

const { t } = useI18n()

const emit = defineEmits<{
  'open-file': [path: string]
}>()

const {
  nodes,
  relations,
  allTags,
  loading,
  error,
  loadData,
  getRelationsForDoc,
  getRelatedDocs,
  getNode,
} = useRelations()
const { selectFile, rootPath } = useFileTree()

const selectedPath = ref<string | null>(null)
const searchQuery = ref('')
const searchFocused = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const graphError = ref('')
const zoomLevel = ref(1)
const graphReady = ref(false)
const initFG = ForceGraphModule as any
let graphInstance: any = null

const NODE_W = 200
const NODE_H = 64
const NODE_RADIUS = 6

const filteredNodes = computed(() => {
  if (!searchQuery.value) return nodes.value
  const q = searchQuery.value.toLowerCase()
  return nodes.value.filter(
    n =>
      n.title.toLowerCase().includes(q) ||
      n.path.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q)),
  )
})

const filteredPaths = computed(() => new Set(filteredNodes.value.map(n => n.path)))

const visibleRelations = computed(() =>
  relations.value.filter(r => filteredPaths.value.has(r.source) && filteredPaths.value.has(r.target)),
)

const graphData = computed(() => {
  const fgNodes = filteredNodes.value.map(n => ({
    id: n.path,
    title: n.title,
    tags: n.tags,
    color: n.color,
  }))
  const fgLinks = visibleRelations.value.map(r => ({
    source: r.source,
    target: r.target,
    score: r.score,
    reason: r.reason,
    sharedTags: r.sharedTags,
  }))
  return { nodes: fgNodes, links: fgLinks }
})

const selectedNode = computed<DocNode | null>(() => {
  if (!selectedPath.value) return null
  return getNode(selectedPath.value) || null
})

const selectedRelations = computed(() => {
  if (!selectedPath.value) return []
  return getRelationsForDoc(selectedPath.value).sort((a, b) => b.score - a.score)
})

const selectedSharedTags = computed(() => {
  if (!selectedNode.value) return []
  const related = getRelatedDocs(selectedNode.value.path)
  const tagCount = new Map<string, number>()
  for (const rPath of related) {
    const node = getNode(rPath)
    if (!node) continue
    for (const t of node.tags) {
      tagCount.set(t, (tagCount.get(t) || 0) + 1)
    }
  }
  return Array.from(tagCount.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
})

const stats = computed(() => ({
  docs: nodes.value.length,
  rels: relations.value.length,
  tags: allTags.value.length,
}))

function selectNode(path: string) {
  selectedPath.value = selectedPath.value === path ? null : path
}

const zoomPercent = computed(() => `${Math.round(zoomLevel.value * 100)}%`)

function zoomIn() {
  if (!graphInstance) return
  const newZoom = Math.min(20, zoomLevel.value * 1.2)
  zoomLevel.value = newZoom
  graphInstance.zoom(newZoom, 200)
}

function zoomOut() {
  if (!graphInstance) return
  const newZoom = Math.max(0.1, zoomLevel.value / 1.2)
  zoomLevel.value = newZoom
  graphInstance.zoom(newZoom, 200)
}

async function openFile(path: string) {
  // Relation graph paths are relative to workspace root, resolve to absolute
  const fullPath = rootPath.value && !path.startsWith('/')
    ? rootPath.value.replace(/\/$/, '') + '/' + path
    : path
  await selectFile(fullPath)
}

function getOutgoingScore(rel: RelationEdge): number | null {
  return rel.source === selectedPath.value ? rel.score : null
}

function getIncomingScore(rel: RelationEdge): number | null {
  return rel.target === selectedPath.value ? rel.score : null
}

function getScoreDisplay(rel: RelationEdge): string {
  const out = getOutgoingScore(rel)
  const inc = getIncomingScore(rel)
  const parts: string[] = []
  if (out !== null) parts.push(`→ ${out.toFixed(1)}`)
  if (inc !== null) parts.push(`← ${inc.toFixed(1)}`)
  return parts.join('  ')
}

function getOtherDoc(rel: RelationEdge): string {
  return rel.source === selectedPath.value ? rel.target : rel.source
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawNode(node: any, ctx: CanvasRenderingContext2D, globalScale: number) {
  const x = node.x - NODE_W / 2
  const y = node.y - NODE_H / 2
  const isSelected = selectedPath.value === node.id
  const colors = getThemeColors()

  // Shadow
  ctx.save()
  ctx.shadowColor = isSelected ? 'rgba(0, 102, 255, 0.2)' : 'rgba(0, 0, 0, 0.06)'
  ctx.shadowBlur = isSelected ? 12 : 6
  ctx.shadowOffsetY = 2
  drawRoundedRect(ctx, x, y, NODE_W, NODE_H, NODE_RADIUS)
  ctx.fillStyle = colors.shadowFg
  ctx.fill()
  ctx.restore()

  // Card background
  drawRoundedRect(ctx, x, y, NODE_W, NODE_H, NODE_RADIUS)
  ctx.fillStyle = colors.surfacePrimary
  ctx.fill()

  // Border
  drawRoundedRect(ctx, x, y, NODE_W, NODE_H, NODE_RADIUS)
  ctx.strokeStyle = isSelected ? colors.accentPrimary : colors.borderSubtle
  ctx.lineWidth = isSelected ? 2 : 1
  ctx.stroke()

  // Color dot
  const dotR = 4
  ctx.beginPath()
  ctx.arc(x + 14, y + NODE_H / 2 - 4, dotR, 0, Math.PI * 2)
  ctx.fillStyle = node.color
  ctx.fill()

  // Title
  const fontSize = Math.min(13, 13 / Math.max(1, globalScale * 0.5))
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.fillStyle = colors.fgPrimary
  ctx.textBaseline = 'middle'
  const maxTitleW = NODE_W - 32
  let title = node.title
  while (ctx.measureText(title).width > maxTitleW && title.length > 3) {
    title = title.slice(0, -4) + '...'
  }
  ctx.fillText(title, x + 26, y + NODE_H / 2 - 4)

  // Tags
  if (node.tags && node.tags.length > 0) {
    const tagFontSize = Math.min(10, 10 / Math.max(1, globalScale * 0.5))
    ctx.font = `${tagFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.fillStyle = colors.fgTertiary
    const tagsStr = node.tags.slice(0, 3).join(' · ')
    let displayTags = tagsStr
    while (ctx.measureText(displayTags).width > maxTitleW && displayTags.length > 3) {
      displayTags = displayTags.slice(0, -4) + '...'
    }
    ctx.fillText(displayTags, x + 26, y + NODE_H / 2 + 12)
  }
}

let resizeObserver: ResizeObserver | null = null
let wheelHandler: ((e: WheelEvent) => void) | null = null
let themeObserver: MutationObserver | null = null

function getThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    fgPrimary: style.getPropertyValue('--foreground-primary').trim() || '#1a1a1a',
    fgTertiary: style.getPropertyValue('--foreground-tertiary').trim() || '#999',
    surfacePrimary: style.getPropertyValue('--surface-primary').trim() || '#ffffff',
    borderSubtle: style.getPropertyValue('--border-subtle').trim() || '#e5e5e5',
    accentPrimary: style.getPropertyValue('--accent-primary').trim() || '#0066FF',
    shadowFg: style.getPropertyValue('--foreground-primary').trim() || '#1a1a1a',
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function initGraph() {
  if (!containerRef.value) {
    graphError.value = 'Graph container not found'
    return
  }

  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  if (width === 0 || height === 0) {
    // Wait for container to get dimensions via ResizeObserver
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          resizeObserver?.disconnect()
          resizeObserver = null
          doInitGraph()
          break
        }
      }
    })
    resizeObserver.observe(container)
    return
  }

  doInitGraph()
}

function doInitGraph() {
  if (!containerRef.value) return
  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  try {
    graphInstance = initFG()(container)
      .width(width)
      .height(height)
      .backgroundColor('transparent')
      .graphData(graphData.value)
      .nodeId('id')
      .nodeVal(1)
      .nodeRelSize(1)
      .linkSource('source')
      .linkTarget('target')
      .nodeCanvasObjectMode(() => 'replace')
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        node.__bckgDimensions = { w: NODE_W, h: NODE_H }
        drawNode(node, ctx, globalScale)
      })
      .nodePointerAreaPaint((node: any, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = color
        drawRoundedRect(ctx, node.x - NODE_W / 2, node.y - NODE_H / 2, NODE_W, NODE_H, NODE_RADIUS)
        ctx.fill()
      })
      .linkWidth((link: any) => 1.5 + (link.score || 0) * 1.5)
      .linkColor((link: any) => {
        const isSelected =
          selectedPath.value === link.source.id || selectedPath.value === link.target.id
        const accent = getThemeColors().accentPrimary
        if (isSelected) return hexToRgba(accent, 0.6)
        return hexToRgba(accent, 0.15)
      })
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalArrowColor((link: any) => {
        const isSelected =
          selectedPath.value === link.source.id || selectedPath.value === link.target.id
        const accent = getThemeColors().accentPrimary
        if (isSelected) return hexToRgba(accent, 0.6)
        return hexToRgba(accent, 0.15)
      })
      .linkLineDash((link: any) => {
        const isSelected =
          selectedPath.value === link.source.id || selectedPath.value === link.target.id
        return isSelected ? null : [2, 2]
      })
      .onNodeClick((node: any) => {
        selectNode(node.id)
      })
      .onBackgroundClick(() => {
        selectedPath.value = null
      })
      .onNodeDrag((node: any) => {
        node.fx = node.x
        node.fy = node.y
      })
      .onNodeDragEnd(() => {})
      .d3AlphaDecay(0.02)
      .d3VelocityDecay(0.3)
      .warmupTicks(50)
      .cooldownTime(3000)

    graphInstance.d3Force('charge')?.strength(-400)
    graphInstance.d3Force('link')?.distance(200)

    // Override wheel: trackpad scroll = pan, pinch (ctrlKey) = zoom
    graphInstance.enableZoomInteraction(false)
    const canvas = container.querySelector('canvas')
    if (canvas) {
      wheelHandler = (e: WheelEvent) => {
        e.preventDefault()
        if (!graphInstance) return

        if (e.ctrlKey || e.metaKey) {
          // Pinch zoom
          const zoom = graphInstance.zoom()
          const factor = 1 - e.deltaY * 0.015
          const newZoom = Math.max(0.1, Math.min(20, zoom * factor))
          zoomLevel.value = newZoom
          graphInstance.zoom(newZoom, 150)
        } else {
          // Scroll pan
          const center = graphInstance.centerAt()
          const scale = 1 / graphInstance.zoom()
          graphInstance.centerAt(
            center.x + e.deltaX * scale,
            center.y + e.deltaY * scale,
            100,
          )
        }
      }
      canvas.addEventListener('wheel', wheelHandler, { passive: false })
    }

    graphError.value = ''
    graphReady.value = true
  } catch (e: any) {
    graphError.value = `Graph init failed: ${e.message}`
    console.error('force-graph init error:', e)
  }
}

function handleResize() {
  if (!graphInstance || !containerRef.value) return
  graphInstance
    .width(containerRef.value.clientWidth)
    .height(containerRef.value.clientHeight)
}

watch(graphData, (data) => {
  if (!graphInstance) return
  graphInstance.graphData(data)
})

watch(selectedPath, () => {
  if (!graphInstance) return
  graphInstance
    .linkColor((link: any) => {
      const isSelected =
        selectedPath.value === link.source.id || selectedPath.value === link.target.id
      const accent = getThemeColors().accentPrimary
      if (isSelected) return hexToRgba(accent, 0.6)
      return hexToRgba(accent, 0.15)
    })
    .linkWidth((link: any) => {
      const isSelected =
        selectedPath.value === link.source.id || selectedPath.value === link.target.id
      return isSelected ? 2.5 + (link.score || 0) * 1.5 : 1 + (link.score || 0) * 1
    })
    .linkLineDash((link: any) => {
      const isSelected =
        selectedPath.value === link.source.id || selectedPath.value === link.target.id
      return isSelected ? null : [2, 2]
    })
    .nodeCanvasObjectMode(() => 'replace')
})

onMounted(async () => {
  try {
    await loadData()
    await nextTick()
    requestAnimationFrame(() => initGraph())
  } catch (e: any) {
    console.error('RelationGraph mount error:', e)
    graphError.value = e.message || 'Failed to initialize'
  }
  window.addEventListener('resize', handleResize)

  themeObserver = new MutationObserver(() => {
    if (graphInstance) {
      graphInstance.nodeCanvasObjectMode(() => 'replace')
    }
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  themeObserver?.disconnect()
  themeObserver = null
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (wheelHandler && containerRef.value) {
    const canvas = containerRef.value.querySelector('canvas')
    canvas?.removeEventListener('wheel', wheelHandler)
    wheelHandler = null
  }
  if (graphInstance) {
    graphInstance._destructor()
    graphInstance = null
    graphReady.value = false
  }
})
</script>

<template>
  <div class="relation-graph">
    <!-- Content -->
    <div class="graph-content">
      <!-- Graph Area -->
      <div class="graph-area">
        <div class="graph-search-box" :class="{ focused: searchFocused }">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            class="graph-search-input"
            :placeholder="t('relationGraph.searchPlaceholder')"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <button
            v-if="searchQuery"
            class="graph-search-clear"
            @click="searchQuery = ''"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div v-if="graphError" class="graph-error">{{ graphError }}</div>
        <div v-else-if="loading" class="graph-loading">{{ t('relationGraph.loading') }}</div>
        <div v-else-if="error" class="graph-error">{{ error }}</div>
        <div v-else-if="nodes.length === 0" class="graph-empty">
          {{ t('relationGraph.empty') }}
        </div>
        <div v-else class="graph-wrapper">
          <div ref="containerRef" class="graph-container" />
          <div v-if="filteredNodes.length === 0" class="graph-empty-overlay">
            {{ t('relationGraph.noSearchResults') }}
          </div>
        </div>
        <div v-if="graphReady && filteredNodes.length > 0" class="zoom-controls">
          <button class="zoom-btn" @click="zoomIn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5v14"/>
            </svg>
          </button>
          <div class="zoom-divider" />
          <span class="zoom-pct">{{ zoomPercent }}</span>
          <div class="zoom-divider" />
          <button class="zoom-btn" @click="zoomOut">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Detail Panel -->
      <Transition name="detail-slide">
        <div v-if="selectedNode" class="detail-panel">
          <div class="detail-content">
            <div class="detail-header-row">
              <div class="detail-label">{{ t('relationGraph.selectedDocument') }}</div>
              <button class="detail-close-btn" @click="selectedPath = null">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          <div class="detail-title-row">
            <span class="detail-dot" :style="{ backgroundColor: selectedNode.color }" />
            <span class="detail-title">{{ selectedNode.title }}</span>
          </div>
          <div class="detail-tags">{{ selectedNode.tags.join(' · ') }}</div>

          <div class="detail-divider" />

          <div class="detail-label">{{ t('relationGraph.relations') }}</div>
          <div
            v-for="rel in selectedRelations"
            :key="getOtherDoc(rel)"
            class="relation-card"
            @click="selectNode(getOtherDoc(rel))"
          >
            <div class="relation-top">
              <span class="relation-name">{{ getNode(getOtherDoc(rel))?.title || getOtherDoc(rel) }}</span>
              <span class="relation-badge">{{ getScoreDisplay(rel) }}</span>
            </div>
            <div v-if="rel.reason" class="relation-reason">{{ rel.reason }}</div>
          </div>
          <div v-if="selectedRelations.length === 0" class="detail-empty-sm">
            {{ t('relationGraph.noRelations') }}
          </div>

          <div class="detail-divider" />

          <div class="detail-label">{{ t('relationGraph.sharedTags') }}</div>
          <div v-if="selectedSharedTags.length > 0" class="tag-row">
            <span
              v-for="tag in selectedSharedTags"
              :key="tag"
              class="tag-chip"
              :style="{ '--tag-color': getNode(selectedNode.path)?.color || 'var(--accent-primary)' }"
            >
              {{ tag }}
            </span>
          </div>
          <div v-else class="detail-empty-sm">
            {{ t('relationGraph.noSharedTags') }}
          </div>

          <div class="detail-stats">
            <div class="stat-item">
              <span class="stat-value">{{ stats.docs }}</span>
              <span class="stat-label">{{ t('relationGraph.statDocuments') }}</span>
            </div>
            <div class="stat-item accent">
              <span class="stat-value">{{ stats.rels }}</span>
              <span class="stat-label">{{ t('relationGraph.statRelations') }}</span>
            </div>
            <div class="stat-item green">
              <span class="stat-value">{{ stats.tags }}</span>
              <span class="stat-label">{{ t('relationGraph.statTags') }}</span>
            </div>
          </div>

          <div class="detail-legend">
            <div class="legend-item">
              <span class="legend-dot accent" />
              <span>{{ t('relationGraph.outgoing') }}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot gray" />
              <span>{{ t('relationGraph.incoming') }}</span>
            </div>
          </div>

          <button class="open-file-btn" @click="openFile(selectedNode.path)">
            {{ t('relationGraph.openInEditor') }}
          </button>
        </div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.relation-graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--surface-primary);
}

/* Search Box */
.graph-search-box {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background-color: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  z-index: 10;
}

.graph-search-box svg {
  color: var(--foreground-tertiary);
  flex-shrink: 0;
}

.graph-search-input {
  border: none;
  background: none;
  outline: none;
  font-size: var(--font-size-sm);
  color: var(--foreground-primary);
  width: 130px;
  font-family: var(--font-sans);
}

.graph-search-input::placeholder {
  color: var(--foreground-tertiary);
}

.graph-search-box.focused {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 1px var(--accent-primary);
}

.graph-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  padding: 0;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  flex-shrink: 0;
}

.graph-search-clear:hover {
  color: var(--foreground-primary);
  background-color: var(--surface-hover);
}

/* Content Layout */
.graph-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Graph Area */
.graph-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  background-color: var(--surface-secondary);
}

.graph-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.graph-container {
  width: 100%;
  height: 100%;
}

.graph-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--foreground-tertiary);
  font-size: var(--font-size-md);
  background-color: var(--surface-secondary);
}

.graph-loading,
.graph-error,
.graph-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--foreground-tertiary);
  font-size: var(--font-size-md);
}

.graph-error {
  color: var(--danger-primary);
}

/* Zoom Controls */
.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  height: 36px;
  border-radius: 8px;
  background-color: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  color: var(--foreground-secondary);
  cursor: pointer;
}

.zoom-btn:hover {
  background-color: var(--surface-hover);
}

.zoom-divider {
  width: 1px;
  height: 20px;
  background-color: var(--border-subtle);
}

.zoom-pct {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 36px;
  font-size: var(--font-size-xs);
  color: var(--foreground-secondary);
  font-family: var(--font-sans);
  user-select: none;
}

/* Detail Panel */
.detail-slide-enter-active,
.detail-slide-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
}

.detail-slide-enter-from,
.detail-slide-leave-to {
  width: 0;
  opacity: 0;
}

.detail-panel {
  width: 320px;
  border-left: 1px solid var(--border-subtle);
  background-color: var(--surface-primary);
  overflow-y: auto;
  flex-shrink: 0;
}

.detail-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
  border-radius: 6px;
}

.detail-close-btn:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}

.detail-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--foreground-tertiary);
  letter-spacing: 0.5px;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.detail-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--foreground-primary);
}

.detail-tags {
  font-size: var(--font-size-sm);
  color: var(--foreground-secondary);
}

.detail-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

/* Relation Cards */
.relation-card {
  padding: 12px;
  border-radius: 8px;
  background-color: var(--surface-secondary);
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.relation-card:hover {
  background-color: var(--surface-hover);
}

.relation-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.relation-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--foreground-primary);
}

.relation-badge {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--foreground-primary);
  padding: 2px 8px;
  border-radius: 4px;
  background-color: var(--surface-primary);
  white-space: nowrap;
}

.relation-reason {
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

.detail-empty-sm {
  font-size: var(--font-size-sm);
  color: var(--foreground-tertiary);
}

/* Shared Tags */
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  font-size: var(--font-size-xs);
  padding: 4px 10px;
  border-radius: 4px;
  color: var(--tag-color);
  background-color: color-mix(in srgb, var(--tag-color) 10%, transparent);
}

/* Stats */
.detail-stats {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--foreground-primary);
}

.stat-item.accent .stat-value {
  color: var(--accent-primary);
}

.stat-item.green .stat-value {
  color: #22C55E;
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

/* Legend */
.detail-legend {
  display: flex;
  gap: 12px;
  padding-top: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.legend-dot.accent {
  background-color: var(--accent-primary);
}

.legend-dot.gray {
  background-color: var(--foreground-tertiary);
}

/* Open File Button */
.open-file-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background-color: var(--surface-primary);
  color: var(--foreground-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  font-family: var(--font-sans);
}

.open-file-btn:hover {
  background-color: var(--surface-hover);
}
</style>
