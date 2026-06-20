import type { MastraVector } from '@mastra/core/vector'
import { randomUUID } from 'crypto'
import type { ProjectMemoryEntry } from '../config/types.js'
import { getEmbedder } from './embedder.js'

const PROJECT_INDEX = 'azent_project_memory'
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface ProjectMemoryStore {
  add: (content: string, category: string, source?: 'auto' | 'manual') => Promise<string>
  search: (query: string, topK?: number) => Promise<ProjectMemoryEntry[]>
  markStale: (id: string) => Promise<void>
  markStaleByCategory: (category: string) => Promise<void>
  markStaleOlderThan: (ttlMs?: number) => Promise<number>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export async function createProjectMemory(
  vector: MastraVector,
): Promise<ProjectMemoryStore> {
  const embedder = await getEmbedder()
  if (embedder) {
    const dimResult = await embedder.doEmbed({ values: ['init'] })
    const dimension = dimResult.embeddings[0].length
    try {
      await vector.createIndex({
        indexName: PROJECT_INDEX,
        dimension,
        metric: 'cosine',
      })
    } catch { /* exists */ }
  }

  return {
    add: async (content, category, source = 'manual') => {
      const id = randomUUID()
      if (!embedder) return id
      const now = Date.now()
      const embedding = (await embedder.doEmbed({ values: [content] })).embeddings[0]
      await vector.upsert({
        indexName: PROJECT_INDEX,
        vectors: [embedding],
        ids: [id],
        metadata: [{
          id, content, category, source,
          stale: false,
          createdAt: now, updatedAt: now, lastAccessedAt: now,
        }],
      })
      return id
    },

    search: async (query, topK = 5) => {
      if (!embedder) return []
      const embedding = (await embedder.doEmbed({ values: [query] })).embeddings[0]
      const results = await vector.query({
        indexName: PROJECT_INDEX,
        queryVector: embedding,
        topK,
      })
      return results.map((r): ProjectMemoryEntry => ({
        id: r.metadata?.id ?? r.id,
        content: r.metadata?.content ?? '',
        category: r.metadata?.category ?? 'general',
        source: r.metadata?.source ?? 'manual',
        stale: r.metadata?.stale ?? false,
        createdAt: r.metadata?.createdAt ?? Date.now(),
        updatedAt: r.metadata?.updatedAt ?? Date.now(),
        lastAccessedAt: r.metadata?.lastAccessedAt ?? Date.now(),
      }))
    },

    markStale: async (id) => {
      await markVectorStale(vector, PROJECT_INDEX, id)
    },

    markStaleByCategory: async (category) => {
      const stats = await vector.describeIndex({ indexName: PROJECT_INDEX })
      if (stats.count === 0) return
      const results = await vector.query({
        indexName: PROJECT_INDEX,
        queryVector: await getDummyEmbedding(),
        topK: stats.count,
      })
      for (const r of results) {
        if (r.metadata?.category === category) {
          await markVectorStale(vector, PROJECT_INDEX, r.metadata?.id ?? r.id, r.metadata)
        }
      }
    },

    markStaleOlderThan: async (ttlMs = STALE_TTL_MS) => {
      const threshold = Date.now() - ttlMs
      const stats = await vector.describeIndex({ indexName: PROJECT_INDEX })
      if (stats.count === 0) return 0
      const results = await vector.query({
        indexName: PROJECT_INDEX,
        queryVector: await getDummyEmbedding(),
        topK: stats.count,
      })
      let count = 0
      for (const r of results) {
        if ((r.metadata?.lastAccessedAt ?? 0) < threshold) {
          await markVectorStale(vector, PROJECT_INDEX, r.metadata?.id ?? r.id, r.metadata)
          count++
        }
      }
      return count
    },

    remove: async (id) => {
      await vector.deleteVector({ indexName: PROJECT_INDEX, id })
    },

    refresh: async () => {
      const stats = await vector.describeIndex({ indexName: PROJECT_INDEX })
      if (stats.count === 0) return
      const results = await vector.query({
        indexName: PROJECT_INDEX,
        queryVector: await getDummyEmbedding(),
        topK: stats.count,
      })
      for (const r of results) {
        await markVectorStale(vector, PROJECT_INDEX, r.metadata?.id ?? r.id, r.metadata)
      }
    },
  }
}

async function markVectorStale(
  vector: MastraVector,
  indexName: string,
  id: string,
  existingMeta?: Record<string, unknown>,
): Promise<void> {
  let meta = existingMeta
  if (!meta) {
    const stats = await vector.describeIndex({ indexName })
    if (stats.count === 0) return
    const results = await vector.query({
      indexName,
      queryVector: await getDummyEmbedding(),
      topK: stats.count,
    })
    const found = results.find((r) => (r.metadata?.id ?? r.id) === id)
    meta = found?.metadata ?? {}
  }
  await vector.updateVector({
    indexName,
    id,
    update: { metadata: { ...meta, stale: true, updatedAt: Date.now() } },
  })
}

let cachedDummyEmbedding: number[] | null = null
async function getDummyEmbedding(): Promise<number[]> {
  if (cachedDummyEmbedding) return cachedDummyEmbedding
  const embedder = await getEmbedder()
  if (!embedder) return []
  const result = await embedder.doEmbed({ values: ['placeholder'] })
  cachedDummyEmbedding = result.embeddings[0]
  return cachedDummyEmbedding
}
