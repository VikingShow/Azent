import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises"
import { join } from "node:path"

export interface LoopPhaseConfig {
  id: string
  agent: string
  feedforward: string
  acceptance: string
}

export interface LoopConfig {
  id: string
  name: string
  phases: LoopPhaseConfig[]
  createdAt: number
}

export interface LoopConfigStore {
  write: (config: LoopConfig) => Promise<string>
  read: (id: string) => Promise<LoopConfig | null>
  list: () => Promise<LoopConfig[]>
  remove: (id: string) => Promise<void>
}

export async function createLoopConfigStore(dataDir: string): Promise<LoopConfigStore> {
  const dir = join(dataDir, "loops")
  await mkdir(dir, { recursive: true })

  function filePath(id: string): string {
    return join(dir, `${id}.json`)
  }

  return {
    write: async (config) => {
      await writeFile(filePath(config.id), JSON.stringify(config, null, 2))
      return config.id
    },

    read: async (id) => {
      try {
        const data = await readFile(filePath(id), "utf-8")
        return JSON.parse(data)
      } catch {
        return null
      }
    },

    list: async () => {
      const files = await readdir(dir).catch(() => [])
      const configs: LoopConfig[] = []
      for (const file of files) {
        if (!file.endsWith(".json")) continue
        try {
          const data = await readFile(join(dir, file), "utf-8")
          configs.push(JSON.parse(data))
        } catch { /* skip */ }
      }
      configs.sort((a, b) => b.createdAt - a.createdAt)
      return configs
    },

    remove: async (id) => {
      await unlink(filePath(id)).catch(() => {})
    },
  }
}
