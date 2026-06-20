import { readFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import {
  agentsFileSchema,
  loopsFileSchema,
  globalConfigSchema,
  type AgentsFileInput,
  type LoopsFileInput,
} from './schema.js'
import type { AzentConfig, GlobalConfig } from './types.js'

const GLOBAL_DIR = resolve(process.env.HOME || '~', '.azent')
const PROJECT_DIR = '.azent'

function packageRoot(): string {
  const here = fileURLToPath(import.meta.url)
  return resolve(dirname(here), '..', '..')
}

const DEFAULT_AGENTS = join(packageRoot(), 'configs', 'agents.yaml')
const DEFAULT_LOOPS = join(packageRoot(), 'configs', 'loops.yaml')

function loadYaml<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, 'utf-8')
  return parseYaml(raw) as T
}

export function loadAgents(projectDir: string = process.cwd()): AgentsFileInput {
  const projectPath = join(projectDir, PROJECT_DIR, 'config', 'agents.yaml')
  const globalPath = join(GLOBAL_DIR, 'agents.yaml')

  const projectFile = loadYaml<Record<string, unknown>>(projectPath)
  const globalFile = loadYaml<Record<string, unknown>>(globalPath)
  const defaultFile = loadYaml<Record<string, unknown>>(DEFAULT_AGENTS)

  if (!projectFile && !globalFile && !defaultFile) {
    throw new Error(`No agents config found. Expected ${projectPath} or ${globalPath}`)
  }

  const merged = {
    agents: {
      ...(defaultFile?.agents ?? {}),
      ...(globalFile?.agents ?? {}),
      ...(projectFile?.agents ?? {}),
    },
    global: {
      ...(defaultFile?.global ?? {}),
      ...(globalFile?.global ?? {}),
      ...(projectFile?.global ?? {}),
    },
  }

  return agentsFileSchema.parse(merged)
}

export function loadLoops(projectDir: string = process.cwd()): LoopsFileInput {
  const projectPath = join(projectDir, PROJECT_DIR, 'config', 'loops.yaml')

  const projectFile = loadYaml<Record<string, unknown>>(projectPath)
  const defaultFile = loadYaml<Record<string, unknown>>(DEFAULT_LOOPS)

  const loops = {
    ...(defaultFile?.loops ?? {}),
    ...(projectFile?.loops ?? {}),
  }

  if (Object.keys(loops).length === 0) {
    return { loops: {} }
  }

  return loopsFileSchema.parse({ loops })
}

export function loadGlobalConfig(): GlobalConfig | null {
  const globalPath = join(GLOBAL_DIR, 'config.yaml')
  const file = loadYaml<Record<string, unknown>>(globalPath)
  if (!file) return null
  return globalConfigSchema.parse(file)
}

export function loadConfig(projectDir: string = process.cwd()): AzentConfig {
  const agentsFile = loadAgents(projectDir)
  const loopsFile = loadLoops(projectDir)

  return {
    agents: agentsFile.agents,
    loops: loopsFile.loops,
    global: agentsFile.global,
  }
}

export function validateConfig(config: AzentConfig): string[] {
  const errors: string[] = []

  for (const [id, agent] of Object.entries(config.agents)) {
    const agentIds = Object.keys(config.agents)
    if (agent.tools) {
      for (const tool of agent.tools) {
        if (!agentIds.includes(tool) && !tool.includes('/')) {
          // tool reference that's not an agent id and not an MCP path
        }
      }
    }
  }

  for (const [id, loop] of Object.entries(config.loops)) {
    for (const phase of loop.phases) {
      if (!config.agents[phase.agent]) {
        errors.push(`Loop "${id}" phase "${phase.id}" references unknown agent "${phase.agent}"`)
      }
    }
  }

  return errors
}
