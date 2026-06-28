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

  function score(entry: ExperienceEntry, query: string): number {
    const lower = query.toLowerCase()
    const texts = [entry.feedforward, entry.problem, entry.solution, entry.output].filter(Boolean) as string[]
    let score = 0
    for (const text of texts) {
      const lowerText = text.toLowerCase()
      const words = lower.split(/\s+/)
      for (const word of words) {
        if (word.length < 2) continue
        if (lowerText.includes(word)) score += word.length / texts.length
      }
    }
    return score
  }

  return {
    record: async (entry) => {
      const id = randomUUID()
      const createdAt = Date.now()
      const full: ExperienceEntry = { id, ...entry, createdAt }
      await writeFile(filePath(id), JSON.stringify(full, null, 2))
      return id
    },

    search: async (query, topK = 5) => {
      const all = await loadAll()
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
