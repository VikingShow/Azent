import type { MastraVector } from '@mastra/core/vector'
import { randomUUID } from 'crypto'
import type { ExperienceEntry } from '../config/types.js'
import { getEmbedder } from './embedder.js'

const EXPERIENCE_INDEX = 'azent_experience_memory'

export interface ExperienceStore {
  record: (entry: Omit<ExperienceEntry, 'id' | 'createdAt'>) => Promise<string>
  search: (query: string, topK?: number) => Promise<ExperienceEntry[]>
  getById: (id: string) => Promise<ExperienceEntry | null>
  count: () => Promise<number>
}

export async function createExperienceStore(
  vector: MastraVector,
): Promise<ExperienceStore> {
  const embedder = await getEmbedder()
  if (embedder) {
    const dimResult = await embedder.doEmbed({ values: ['init'] })
    const dimension = dimResult.embeddings[0].length
    try {
      await vector.createIndex({
        indexName: EXPERIENCE_INDEX,
        dimension,
        metric: 'cosine',
      })
    } catch { /* exists */ }
  }

  return {
    record: async (entry) => {
      const id = randomUUID()
      if (!embedder) return id
      const now = Date.now()
      const searchText = `${entry.feedforward} | ${entry.problem || ''} | ${entry.solution || ''}`
      const embedding = (await embedder.doEmbed({ values: [searchText] })).embeddings[0]
      await vector.upsert({
        indexName: EXPERIENCE_INDEX,
        vectors: [embedding],
        metadata: [{
          id,
          feedforward: entry.feedforward,
          output: entry.output,
          problem: entry.problem,
          solution: entry.solution,
          failureMode: entry.failureMode,
          verified: entry.verified,
          projectId: entry.projectId,
          createdAt: now,
        }],
      })
      return id
    },

    search: async (query, topK = 5) => {
      if (!embedder) return []
      const embedding = (await embedder.doEmbed({ values: [query] })).embeddings[0]
      const results = await vector.query({
        indexName: EXPERIENCE_INDEX,
        queryVector: embedding,
        topK,
      })
      return results.map((r): ExperienceEntry => ({
        id: r.metadata?.id ?? r.id,
        feedforward: r.metadata?.feedforward ?? '',
        output: r.metadata?.output ?? '',
        problem: r.metadata?.problem,
        solution: r.metadata?.solution,
        failureMode: r.metadata?.failureMode,
        verified: r.metadata?.verified ?? false,
        projectId: r.metadata?.projectId ?? '',
        createdAt: r.metadata?.createdAt ?? Date.now(),
      }))
    },

    getById: async (id) => {
      const stats = await vector.describeIndex({ indexName: EXPERIENCE_INDEX })
      if (stats.count === 0) return null
      const embedder = await getEmbedder()
      if (!embedder) return null
      const dummyResult = await embedder.doEmbed({ values: ['placeholder'] })
      const results = await vector.query({
        indexName: EXPERIENCE_INDEX,
        queryVector: dummyResult.embeddings[0],
        topK: stats.count,
      })
      const r = results.find((res) => (res.metadata?.id ?? res.id) === id)
      if (!r) return null
      return {
        id: r.metadata?.id ?? r.id,
        feedforward: r.metadata?.feedforward ?? '',
        output: r.metadata?.output ?? '',
        problem: r.metadata?.problem,
        solution: r.metadata?.solution,
        failureMode: r.metadata?.failureMode,
        verified: r.metadata?.verified ?? false,
        projectId: r.metadata?.projectId ?? '',
        createdAt: r.metadata?.createdAt ?? Date.now(),
      }
    },

    count: async () => {
      const stats = await vector.describeIndex({ indexName: EXPERIENCE_INDEX })
      return stats.count
    },
  }
}
