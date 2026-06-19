export interface AgentConfig {
  id: string
  name: string
  description?: string
  instructions: string
  model: string
  maxRetries?: number
  tools?: string[]
  mcpServers?: Record<string, McpServerConfig>
  requireApproval?: boolean | string[]
  memory?: boolean
  maxSteps?: number
}

export interface McpServerConfig {
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  requireToolApproval?: boolean
}

export interface LoopPhase {
  id: string
  name: string
  acceptance: string
  agent: string
}

export interface LoopTemplate {
  name: string
  allowModification: boolean
  phases: LoopPhase[]
}

export interface GlobalConfig {
  defaultModel?: string
  language?: string
  codeStyle?: Record<string, unknown>
}

export interface AzentConfig {
  agents: Record<string, AgentConfig>
  loops: Record<string, LoopTemplate>
  global?: GlobalConfig
}

export interface Feedforward {
  task: string
  acceptanceCriteria: string
  constraints?: string[]
  agentId: string
  phaseId: string
}

export interface LoopPhaseResult {
  phaseId: string
  agentId: string
  output: string
  passed: boolean
  feedback?: string
  retries: number
  duration?: number
}

export type MemoryType = 'project' | 'experience' | 'session' | 'working'

export interface ProjectMemoryEntry {
  id: string
  content: string
  category: string
  source: 'auto' | 'manual'
  stale: boolean
  createdAt: number
  updatedAt: number
  lastAccessedAt: number
}

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

export interface ConsolidationResult {
  merged: number
  deleted: number
  kept: number
}
