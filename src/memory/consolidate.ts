import type { MastraVector } from '@mastra/core/vector'
import { fastembed } from '@mastra/fastembed'
import type { ExperienceEntry } from '../config/types.js'
import type { ExperienceStore } from './experience.js'
import type { ConsolidationResult } from '../config/types.js'

const SIMILARITY_THRESHOLD = 0.85

export interface Consolidator {
  consolidateExperiences: (store: ExperienceStore) => Promise<ConsolidationResult>
}

export async function createConsolidator(
  vector: MastraVector,
): Promise<Consolidator> {
  return {
    consolidateExperiences: async (store) => {
      return consolidateExperiences(store, vector)
    },
  }
}

async function consolidateExperiences(
  store: ExperienceStore,
  vector: MastraVector,
): Promise<ConsolidationResult> {
  const embedder = fastembed
  const count = await store.count()
  if (count < 2) {
    return { merged: 0, deleted: 0, kept: count }
  }

  const allEntries = await fetchAllEntries(store, vector)
  const merged: ExperienceEntry[] = []
  const toDelete: string[] = []

  for (const entry of allEntries) {
    const isDuplicate = merged.some((m) => {
      return m.id === entry.id
    })
    if (isDuplicate) continue

    const searchText = `${entry.feedforward} | ${entry.problem || ''} | ${entry.solution || ''}`
    const embedding = (await embedder.doEmbed({ values: [searchText] })).embeddings[0]
    const results = await vector.query({
      indexName: 'azent_experience_memory',
      queryVector: embedding,
      topK: 10,
    })

    const similarIds = results
      .filter((r) => r.score >= SIMILARITY_THRESHOLD && r.metadata?.id !== entry.id)
      .map((r) => r.metadata?.id)
      .filter(Boolean) as string[]

    if (similarIds.length === 0) {
      merged.push(entry)
      continue
    }

    const similarEntries = allEntries.filter((e) => similarIds.includes(e.id))
    const consolidated = mergeEntries([entry, ...similarEntries])
    merged.push(consolidated)
    toDelete.push(...similarIds)
  }

  let deletedCount = 0
  for (const id of toDelete) {
    try {
      await vector.deleteVector({
        indexName: 'azent_experience_memory',
        id,
      })
      deletedCount++
    } catch {
      // Already deleted
    }
  }

  const mergedCount = toDelete.length > 0 ? allEntries.length - merged.length - 0 : 0

  return {
    merged: mergedCount,
    deleted: deletedCount,
    kept: merged.length,
  }
}

async function fetchAllEntries(
  store: ExperienceStore,
  vector: MastraVector,
): Promise<ExperienceEntry[]> {
  const stats = await vector.describeIndex({ indexName: 'azent_experience_memory' })
  const results = await vector.query({
    indexName: 'azent_experience_memory',
    topK: stats.count,
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
}

function mergeEntries(entries: ExperienceEntry[]): ExperienceEntry {
  const sorted = entries.sort((a, b) => b.createdAt - a.createdAt)
  const newest = sorted[0]
  const allSolutions = entries
    .map((e) => e.solution)
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i)

  return {
    ...newest,
    solution: allSolutions.join('\n---\n'),
    failureMode: entries.find((e) => e.failureMode)?.failureMode,
    verified: entries.some((e) => e.verified),
  }
}

export async function shouldConsolidate(
  store: ExperienceStore,
  threshold: number = 10,
): Promise<boolean> {
  const count = await store.count()
  return count >= threshold
}
