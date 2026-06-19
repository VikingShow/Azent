import { z } from 'zod'

export const mcpServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  env: z.record(z.string()).optional(),
  requireToolApproval: z.boolean().optional(),
}).refine(
  (v) => v.command !== undefined || v.url !== undefined,
  { message: 'MCP server must have either command or url' },
)

export const agentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
  model: z.string().min(1),
  maxRetries: z.number().int().min(0).optional(),
  tools: z.array(z.string()).optional(),
  mcpServers: z.record(mcpServerSchema).optional(),
  requireApproval: z.union([z.boolean(), z.array(z.string())]).optional(),
  memory: z.boolean().optional(),
  maxSteps: z.number().int().min(1).optional(),
})

export const loopPhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  acceptance: z.string().min(1),
  agent: z.string().min(1),
})

export const loopTemplateSchema = z.object({
  name: z.string().min(1),
  allowModification: z.boolean(),
  phases: z.array(loopPhaseSchema).min(1),
})

export const globalConfigSchema = z.object({
  defaultModel: z.string().optional(),
  language: z.string().optional(),
  codeStyle: z.record(z.unknown()).optional(),
})

export const agentsFileSchema = z.object({
  agents: z.record(agentConfigSchema),
  global: globalConfigSchema.optional(),
})

export const loopsFileSchema = z.object({
  loops: z.record(loopTemplateSchema),
})

export type AgentConfigInput = z.infer<typeof agentConfigSchema>
export type LoopTemplateInput = z.infer<typeof loopTemplateSchema>
export type McpServerInput = z.infer<typeof mcpServerSchema>
export type AgentsFileInput = z.infer<typeof agentsFileSchema>
export type LoopsFileInput = z.infer<typeof loopsFileSchema>
