import { ref, computed } from 'vue'
import { GetDocumentMetas, GetDocumentRelations } from '../../wailsjs/go/main/App'

export interface DocumentMeta {
  title: string
  summary: string
  tags: string[]
  status: string
  contentHash?: string
}

export interface Relation {
  source: string
  target: string
  score: number
  reason: string
  sharedTags: string[]
  type?: string
}

export interface DocNode {
  path: string
  title: string
  summary: string
  tags: string[]
  color: string
}

export interface RelationEdge {
  source: string
  target: string
  score: number
  reason: string
  sharedTags: string[]
  type?: string
  incomingScore?: number
  incomingReason?: string
  incomingType?: string
}

const NODE_COLORS = [
  '#0066FF', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444',
  '#14B8A6', '#F97316', '#EC4899', '#6366F1', '#84CC16',
  '#06B6D4', '#A855F7', '#F43F5E', '#10B981', '#3B82F6',
]

const RELATION_TYPE_COLORS: Record<string, string> = {
  'references': '#3B82F6',
  'extends': '#22C55E',
  'contrasts': '#F59E0B',
  'depends-on': '#EF4444',
  'similar-to': '#8B5CF6',
}

const metas = ref<Map<string, DocumentMeta>>(new Map())
const relations = ref<RelationEdge[]>([])
const loading = ref(false)
const error = ref('')
const colorMap = ref<Map<string, string>>(new Map())

export function useRelations() {
  const nodes = computed<DocNode[]>(() => {
    const result: DocNode[] = []
    let colorIndex = 0
    for (const path of metas.value.keys()) {
      if (colorMap.value.has(path)) colorIndex++
    }
    for (const [path, meta] of metas.value) {
      if (!colorMap.value.has(path)) {
        colorMap.value.set(path, NODE_COLORS[colorIndex % NODE_COLORS.length])
        colorIndex++
      }
      result.push({
        path,
        title: meta.title || path,
        summary: meta.summary || '',
        tags: meta.tags || [],
        color: colorMap.value.get(path)!,
      })
    }
    return result
  })

  const allTags = computed<string[]>(() => {
    const tagSet = new Set<string>()
    for (const meta of metas.value.values()) {
      for (const tag of meta.tags) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  })

  const allRelationTypes = computed<string[]>(() => {
    const typeSet = new Set<string>()
    for (const r of relations.value) {
      if (r.type) typeSet.add(r.type)
    }
    return Array.from(typeSet).sort()
  })

  async function loadData() {
    loading.value = true
    error.value = ''
    try {
      const [metasJSON, relsJSON] = await Promise.all([
        GetDocumentMetas(),
        GetDocumentRelations(),
      ])

      const metasParsed = JSON.parse(metasJSON)
      if (metasParsed.error) {
        error.value = metasParsed.error
        return
      }

      const newMetas = new Map<string, DocumentMeta>()
      for (const m of metasParsed) {
        newMetas.set(m.path, m)
      }
      metas.value = newMetas

      const relsParsed = JSON.parse(relsJSON)
      if (relsParsed.error) {
        error.value = relsParsed.error
        return
      }

      const edges: RelationEdge[] = []
      for (const source in relsParsed) {
        for (const r of relsParsed[source]) {
          edges.push({
            source: r.source,
            target: r.target,
            score: r.score,
            reason: r.reason,
            sharedTags: r.sharedTags || [],
            type: r.type,
          })
        }
      }
      relations.value = edges
    } catch (e: any) {
      error.value = e.message || 'Failed to load data'
    } finally {
      loading.value = false
    }
  }

  function getRelationsForDoc(docPath: string): RelationEdge[] {
    const outgoing = relations.value.filter(r => r.source === docPath)
    const incoming = relations.value.filter(r => r.target === docPath)
    const map = new Map<string, RelationEdge>()

    for (const r of outgoing) {
      map.set(r.target, { ...r })
    }
    for (const r of incoming) {
      const existing = map.get(r.source)
      if (existing) {
        existing.incomingScore = r.score
        existing.incomingReason = r.reason
        existing.incomingType = r.type
      } else {
        const cloned: RelationEdge = { ...r }
        if (r.type) {
          cloned.incomingType = r.type
          delete (cloned as any).type
        }
        map.set(r.source, cloned)
      }
    }

    return Array.from(map.values())
  }

  function getRelatedDocs(docPath: string): string[] {
    const related = new Set<string>()
    for (const r of relations.value) {
      if (r.source === docPath) related.add(r.target)
      if (r.target === docPath) related.add(r.source)
    }
    return Array.from(related)
  }

  const nodeMap = computed<Map<string, DocNode>>(() => {
    const map = new Map<string, DocNode>()
    for (const n of nodes.value) {
      map.set(n.path, n)
    }
    return map
  })

  function getNode(path: string): DocNode | undefined {
    return nodeMap.value.get(path)
  }

  function getRelationTypeColor(type: string | undefined): string {
    if (!type) return 'var(--accent-primary)'
    return RELATION_TYPE_COLORS[type] || 'var(--accent-primary)'
  }

  return {
    metas,
    relations,
    nodes,
    allTags,
    allRelationTypes,
    loading,
    error,
    loadData,
    getRelationsForDoc,
    getRelatedDocs,
    getNode,
    getRelationTypeColor,
  }
}
