import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises"
import { join } from "node:path"
import { Context, Effect, Layer } from "effect"
import { InstanceState } from "@/effect/instance-state"

export interface ExperienceEntry {
  id: string
  feedforward: string
  output: string
  problem?: string
  solution?: string
  failureMode?: string
  verified: boolean
  projectId: string
  createdAt: number
}

export interface ExperienceStore {
  record: (entry: Omit<ExperienceEntry, "id" | "createdAt">) => Promise<string>
  search: (query: string, topK?: number) => Promise<ExperienceEntry[]>
  getById: (id: string) => Promise<ExperienceEntry | null>
  count: () => Promise<number>
}

export async function createExperienceStore(dataDir: string): Promise<ExperienceStore> {
  const dir = join(dataDir, "experience")
  await mkdir(dir, { recursive: true })

  function filePath(id: string): string {
    return join(dir, `${id}.json`)
  }

  async function loadAll(): Promise<ExperienceEntry[]> {
    const files = await readdir(dir).catch(() => [])
    const entries: ExperienceEntry[] = []
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const data = await readFile(join(dir, file), "utf-8")
        entries.push(JSON.parse(data))
      } catch { /* skip corrupted */ }
    }
    return entries
  }

  // Simple stopwords for TF-IDF
  const STOPWORDS = new Set([
    "the", "this", "that", "with", "from", "your", "have", "will", "when",
    "make", "they", "them", "then", "than", "also", "just", "only", "very",
    "much", "such", "must", "should", "never", "always", "each", "every",
    "which", "what", "been", "being", "were", "their", "about", "into",
    "other", "some", "could", "would", "these", "those",
  ])

  function tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  }

  function score(entry: ExperienceEntry, query: string): number {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return 0

    const texts = [entry.feedforward, entry.problem, entry.solution, entry.output].filter(Boolean) as string[]
    const docTokens = tokenize(texts.join(" "))

    // TF: term frequency in document
    let tfScore = 0
    for (const qt of queryTokens) {
      const count = docTokens.filter((dt) => dt === qt).length
      if (count > 0) {
        tfScore += Math.log1p(count) / docTokens.length
      }
    }

    // Field importance: feedforward and problem are more important
    const feedforwardTokens = tokenize(entry.feedforward || "")
    const problemTokens = tokenize(entry.problem || "")
    let fieldBoost = 0
    for (const qt of queryTokens) {
      if (feedforwardTokens.includes(qt)) fieldBoost += 0.3
      if (problemTokens.includes(qt)) fieldBoost += 0.2
    }

    return tfScore + fieldBoost
  }

  // In-memory cache to avoid disk reads on every search
  let cache: ExperienceEntry[] | null = null
  let cacheVersion = 0

  function invalidateCache() {
    cache = null
    cacheVersion++
  }

  async function loadAllCached(): Promise<ExperienceEntry[]> {
    if (cache) return cache
    cache = await loadAll()
    return cache
  }

  return {
    record: async (entry) => {
      const id = randomUUID()
      const createdAt = Date.now()
      const full: ExperienceEntry = { id, ...entry, createdAt }
      await writeFile(filePath(id), JSON.stringify(full, null, 2))
      invalidateCache()
      return id
    },

    search: async (query, topK = 5) => {
      const all = await loadAllCached()
      const scored = all.map((e) => ({ entry: e, score: score(e, query) }))
      scored.sort((a, b) => b.score - a.score)
      return scored.slice(0, topK).map((s) => s.entry)
    },

    getById: async (id) => {
      try {
        const data = await readFile(filePath(id), "utf-8")
        return JSON.parse(data)
      } catch {
        return null
      }
    },

    count: async () => {
      const all = await loadAll()
      return all.length
    },
  }
}

export interface ExperienceInterface extends ExperienceStore {}

export class ExperienceService extends Context.Service<ExperienceService, ExperienceInterface>()("@azent/Experience") {}

export const layer = Layer.effect(
  ExperienceService,
  Effect.gen(function* () {
    const ctx = yield* InstanceState.context
    const dataDir = join(ctx.worktree, ".azent", "data")
    return yield* Effect.promise(() => createExperienceStore(dataDir))
  }),
)

export const defaultLayer = layer

export * as Experience from "./store"
