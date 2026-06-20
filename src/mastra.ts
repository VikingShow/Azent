import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core'
import { Memory } from '@mastra/memory'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { MCPClient } from '@mastra/mcp'
import { fastembed } from '@mastra/fastembed'
import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { AgentConfig as AzentAgentConfig, AzentConfig, ModelConfig } from './config/types.js'
import { loadConfig, validateConfig } from './config/loader.js'

const AZENT_DIR = '.azent'
const MEMORY_DIR = 'memory'
const DB_FILE = 'mastra.db'

export async function createMastraInstance(projectDir: string = process.cwd()): Promise<{
  mastra: Mastra
  config: AzentConfig
  mcpClients: MCPClient[]
}> {
  const config = loadConfig(projectDir)
  const errors = validateConfig(config)
  if (errors.length > 0) {
    throw new Error(`Config validation errors:\n${errors.join('\n')}`)
  }

  const azentPath = join(projectDir, AZENT_DIR)
  const memoryPath = join(azentPath, MEMORY_DIR)
  const dbPath = join(azentPath, DB_FILE)

  if (!existsSync(memoryPath)) {
    mkdirSync(memoryPath, { recursive: true })
  }

  const storage = new LibSQLStore({
    id: 'azent-storage',
    url: `file:${dbPath}`,
  })

  const vector = new LibSQLVector({
    id: 'azent-vector',
    url: `file:${dbPath}`,
  })

  const embedder = fastembed

  const memory = new Memory({
    storage,
    vector,
    embedder,
    options: {
      lastMessages: 20,
    },
  })

  const mcpClients: MCPClient[] = []
  const allMcpServers: Record<string, { command?: string; args?: string[]; url?: string; env?: Record<string, string> }> = {}

  for (const agentConfig of Object.values(config.agents)) {
    if (agentConfig.mcpServers) {
      for (const [name, server] of Object.entries(agentConfig.mcpServers)) {
        if (!allMcpServers[name]) {
          allMcpServers[name] = {
            command: server.command,
            args: server.args,
            url: server.url,
            env: server.env,
          }
        }
      }
    }
  }

  const mcpServerEntries = Object.entries(allMcpServers).map(([name, server]) => {
    const entry: Record<string, unknown> = {}
    if (server.url) {
      entry.url = new URL(server.url)
    } else {
      entry.command = server.command
      if (server.args) entry.args = server.args
    }
    if (server.env) entry.env = server.env
    return [name, entry] as const
  })

  let mcpTools: Record<string, unknown> = {}
  if (mcpServerEntries.length > 0) {
    const mcpClient = new MCPClient({
      id: 'azent-mcp',
      servers: Object.fromEntries(mcpServerEntries) as any,
    })
    mcpClients.push(mcpClient)
    try {
      mcpTools = await mcpClient.listTools()
    } catch (e) {
      console.warn('MCP tools loading failed (non-fatal):', e)
    }
  }

  const agents: Record<string, Agent> = {}
  for (const [id, agentConfig] of Object.entries(config.agents)) {
    agents[id] = createAgent(id, agentConfig, memory, mcpTools)
  }

  const mastra = new Mastra({
    agents,
    storage,
    vectors: { libsql: vector },
    memory: { default: memory },
  })

  return { mastra, config, mcpClients }
}

function resolveModel(model: string | ModelConfig): string | Record<string, unknown> {
  if (typeof model === 'string') return model
  const resolved: Record<string, unknown> = { id: model.id }
  if (model.url) resolved.url = model.url
  if (model.apiKey) {
    resolved.apiKey = model.apiKey.startsWith('$')
      ? process.env[model.apiKey.slice(1)] ?? ''
      : model.apiKey
  }
  if (model.headers) resolved.headers = model.headers
  return resolved
}

function createAgent(
  id: string,
  config: AzentAgentConfig,
  memory: Memory,
  mcpTools: Record<string, unknown>,
): Agent {
  const requireApproval = config.requireApproval
  let approvalConfig: boolean | ((ctx: any) => boolean | Promise<boolean>) | undefined

  if (typeof requireApproval === 'boolean') {
    approvalConfig = requireApproval
  } else if (Array.isArray(requireApproval)) {
    const toolNames = new Set(requireApproval)
    approvalConfig = (ctx: { toolName: string }) => toolNames.has(ctx.toolName)
  }

  const agentConfig: Record<string, unknown> = {
    id,
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    model: resolveModel(config.model),
    maxRetries: config.maxRetries ?? 0,
    memory: config.memory !== false ? memory : undefined,
    defaultOptions: {
      maxSteps: config.maxSteps ?? 20,
      ...(approvalConfig !== undefined ? { requireToolApproval: approvalConfig } : {}),
    },
  }

  if (Object.keys(mcpTools).length > 0) {
    agentConfig.tools = mcpTools
  }

  return new Agent(agentConfig as any)
}

export async function disconnectMcp(mcpClients: MCPClient[]): Promise<void> {
  await Promise.all(mcpClients.map((c) => c.disconnect().catch(() => {})))
}
