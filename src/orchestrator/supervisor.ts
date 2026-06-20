import { Agent } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core'
import type { AzentConfig, Feedforward, LoopPhaseResult, ModelConfig } from '../config/types.js'

export interface SupervisorHooks {
  onPhaseStart?: (phaseId: string, agentId: string, feedforward: Feedforward) => void | Promise<void>
  onPhaseComplete?: (result: LoopPhaseResult) => void | Promise<void>
  onPhaseRetry?: (phaseId: string, attempt: number, feedback: string) => void | Promise<void>
  onEscalate?: (phaseId: string, reason: string) => void | Promise<void>
  onPhaseModified?: (action: 'add' | 'skip', phaseId: string) => void | Promise<void>
}

export interface SupervisorOptions {
  maxRetries?: number
  hooks?: SupervisorHooks
}

export function createSupervisor(
  mastra: Mastra,
  config: AzentConfig,
  options: SupervisorOptions = {},
): Agent {
  const defaultModelRaw = config.global?.defaultModel || 'openai/gpt-4.1'
  const defaultModel = typeof defaultModelRaw === 'string'
    ? defaultModelRaw
    : resolveModelObject(defaultModelRaw)

  const subAgentRecords: Record<string, Agent> = {}
  for (const id of Object.keys(config.agents)) {
    const agent = mastra.getAgent(id as any)
    if (agent) {
      subAgentRecords[id] = agent
    }
  }

  const instructions = buildSupervisorInstructions(config)

  const supervisor = new Agent({
    id: 'supervisor',
    name: 'Supervisor',
    description: 'Orchestrates sub-agents to complete tasks via feedforward-feedback loops.',
    instructions,
    model: defaultModel as any,
    agents: subAgentRecords,
    defaultOptions: {
      maxSteps: 50,
      ...(options.hooks ? {
        onDelegationStart: async (ctx: { primitiveId: string; prompt: string; iteration: number }) => {
          if (ctx.iteration > 10) {
            return { proceed: false, rejectionReason: 'Max iterations reached' }
          }
          return { proceed: true }
        },
        onDelegationComplete: async (ctx: { primitiveId: string; result?: string; error?: string; bail: () => void }) => {
          if (ctx.error) {
            ctx.bail()
          }
          return undefined
        },
      } : {}),
    },
  })

  return supervisor
}

function buildSupervisorInstructions(config: AzentConfig): string {
  const agentList = Object.values(config.agents)
    .map((a) => `- ${a.id}: ${a.description || a.name}`)
    .join('\n')

  const loopList = Object.entries(config.loops)
    .map(([id, loop]) => {
      const phases = loop.phases.map((p) => `  ${p.id} (${p.agent}): ${p.acceptance}`).join('\n')
      return `${id} [allowModification: ${loop.allowModification}]:\n${phases}`
    })
    .join('\n\n')

  return `You are the Supervisor agent. You orchestrate sub-agents to complete tasks.

Available agents:
${agentList}

Available loop templates (phases with acceptance criteria):
${loopList}

Your responsibilities:
1. Receive a task from the user and select the appropriate loop template
2. For each phase in the loop template, delegate to the specified agent with clear feedforward (task description + acceptance criteria)
3. Review each agent's output against the acceptance criteria
4. If output does not meet criteria, provide feedback and retry (max ${config.global?.defaultModel ? 3 : 3} retries)
5. If retries exhausted, escalate to the user
6. If a loop template has allowModification=true, you may suggest adding/skipping phases
7. Summarize results to the user when all phases are complete
8. If any phase fails irrecoverably, stop and ask the user for guidance

Always provide clear feedforward when delegating: what to do, what success looks like.`
}

function resolveModelObject(model: ModelConfig): Record<string, unknown> {
  const resolved: Record<string, unknown> = { id: model.id }
  if (model.url) {
    resolved.url = model.url.startsWith('$')
      ? process.env[model.url.slice(1)] ?? model.url
      : model.url
  }
  if (model.apiKey) {
    resolved.apiKey = model.apiKey.startsWith('$')
      ? process.env[model.apiKey.slice(1)] ?? ''
      : model.apiKey
  }
  if (model.headers) resolved.headers = model.headers
  return resolved
}
