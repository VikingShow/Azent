import type { Agent } from '@mastra/core/agent'
import type { Mastra } from '@mastra/core'
import type {
  AzentConfig,
  LoopTemplate,
  Feedforward,
  LoopPhaseResult,
  ExperienceEntry,
} from '../config/types.js'
import type { SupervisorHooks } from './supervisor.js'

export interface LoopRunOptions {
  loopId: string
  task: string
  maxRetries?: number
  hooks?: SupervisorHooks
  experience?: ExperienceEntry[]
}

export interface LoopRunResult {
  loopId: string
  task: string
  phases: LoopPhaseResult[]
  success: boolean
  summary: string
  error?: string
}

export interface LoopEngine {
  run: (options: LoopRunOptions) => Promise<LoopRunResult>
}

export function createLoopEngine(
  mastra: Mastra,
  config: AzentConfig,
  supervisor: Agent,
): LoopEngine {
  return {
    run: async (options: LoopRunOptions) => {
      return runLoop(mastra, config, supervisor, options)
    },
  }
}

async function runLoop(
  mastra: Mastra,
  config: AzentConfig,
  supervisor: Agent,
  options: LoopRunOptions,
): Promise<LoopRunResult> {
  const { loopId, task, maxRetries = 3, hooks } = options
  const loop = config.loops[loopId]

  if (!loop) {
    return {
      loopId,
      task,
      phases: [],
      success: false,
      summary: '',
      error: `Unknown loop template: ${loopId}`,
    }
  }

  const phases = [...loop.phases]
  const results: LoopPhaseResult[] = []
  const contextBase = buildContextBase(task, loop, options.experience)

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    const agent = mastra.getAgent(phase.agent)

    if (!agent) {
      const result: LoopPhaseResult = {
        phaseId: phase.id,
        agentId: phase.agent,
        output: '',
        passed: false,
        feedback: `Agent "${phase.agent}" not found`,
        retries: 0,
      }
      results.push(result)
      if (hooks?.onEscalate) await hooks.onEscalate(phase.id, result.feedback!)
      return {
        loopId,
        task,
        phases: results,
        success: false,
        summary: '',
        error: result.feedback,
      }
    }

    const feedforward: Feedforward = {
      task: buildPhaseTask(task, phase, results, contextBase),
      acceptanceCriteria: phase.acceptance,
      constraints: options.experience
        ? options.experience.map((e) => e.solution).filter(Boolean) as string[]
        : undefined,
      agentId: phase.agent,
      phaseId: phase.id,
    }

    if (hooks?.onPhaseStart) await hooks.onPhaseStart(phase.id, phase.agent, feedforward)

    const phaseResult = await executePhase(
      agent,
      feedforward,
      maxRetries,
      hooks,
    )

    results.push(phaseResult)

    if (!phaseResult.passed) {
      return {
        loopId,
        task,
        phases: results,
        success: false,
        summary: '',
        error: `Phase "${phase.name}" failed after ${phaseResult.retries} retries`,
      }
    }

    if (loop.allowModification && hooks?.onPhaseModified) {
      // Agent could suggest modifications here; handled via supervisor delegation
      // For now, the loop template is followed strictly unless allowModification enables dynamic changes
    }
  }

  const summary = await generateSummary(supervisor, task, results)

  return {
    loopId,
    task,
    phases: results,
    success: true,
    summary,
  }
}

async function executePhase(
  agent: Agent,
  feedforward: Feedforward,
  maxRetries: number,
  hooks?: SupervisorHooks,
): Promise<LoopPhaseResult> {
  const prompt = formatFeedforward(feedforward)
  let retries = 0
  let lastOutput = ''
  let lastFeedback = ''

  while (retries <= maxRetries) {
    const fullPrompt = retries === 0 ? prompt : `${prompt}\n\nPrevious attempt failed. Feedback: ${lastFeedback}`

    try {
      const response = await agent.generate(fullPrompt, {
        maxSteps: 10,
      })

      lastOutput = response.text

      const evaluation = await evaluateOutput(agent, feedforward, lastOutput)

      if (evaluation.passed) {
        const result: LoopPhaseResult = {
          phaseId: feedforward.phaseId,
          agentId: feedforward.agentId,
          output: lastOutput,
          passed: true,
          retries,
        }
        if (hooks?.onPhaseComplete) await hooks.onPhaseComplete(result)
        return result
      }

      lastFeedback = evaluation.feedback
      retries++

      if (hooks?.onPhaseRetry && retries <= maxRetries) {
        await hooks.onPhaseRetry(feedforward.phaseId, retries, lastFeedback)
      }
    } catch (e) {
      lastFeedback = e instanceof Error ? e.message : String(e)
      retries++
      if (hooks?.onPhaseRetry && retries <= maxRetries) {
        await hooks.onPhaseRetry(feedforward.phaseId, retries, lastFeedback)
      }
    }
  }

  const result: LoopPhaseResult = {
    phaseId: feedforward.phaseId,
    agentId: feedforward.agentId,
    output: lastOutput,
    passed: false,
    feedback: lastFeedback,
    retries,
  }

  if (hooks?.onEscalate) await hooks.onEscalate(feedforward.phaseId, `Max retries (${maxRetries}) exceeded`)
  return result
}

async function evaluateOutput(
  agent: Agent,
  feedforward: Feedforward,
  output: string,
): Promise<{ passed: boolean; feedback: string }> {
  if (output.length < 10) {
    return { passed: false, feedback: 'Output too short to be valid' }
  }
  return { passed: true, feedback: '' }
}

async function generateSummary(
  supervisor: Agent,
  task: string,
  results: LoopPhaseResult[],
): Promise<string> {
  const phaseSummaries = results
    .map((r) => `[${r.phaseId}] ${r.passed ? 'PASS' : 'FAIL'}: ${r.output.slice(0, 200)}...`)
    .join('\n')

  try {
    const response = await supervisor.generate(
      `Task: ${task}\n\nPhase results:\n${phaseSummaries}\n\nSummarize the outcome concisely.`,
      { maxSteps: 3 },
    )
    return response.text
  } catch {
    return phaseSummaries
  }
}

function buildContextBase(
  task: string,
  loop: LoopTemplate,
  experience?: ExperienceEntry[],
): string {
  const expContext = experience && experience.length > 0
    ? `\nRelated past experiences:\n${experience.map((e) => `- ${e.feedforward}: ${e.solution}`).join('\n')}`
    : ''
  return `Task: ${task}\nLoop: ${loop.name}${expContext}`
}

function buildPhaseTask(
  task: string,
  phase: { id: string; name: string; acceptance: string; agent: string },
  previousResults: LoopPhaseResult[],
  contextBase: string,
): string {
  const prevContext = previousResults.length > 0
    ? `\n\nPrevious phase outputs:\n${previousResults.map((r) => `[${r.phaseId}]: ${r.output.slice(0, 500)}`).join('\n')}`
    : ''
  return `${contextBase}\n\nCurrent phase: ${phase.name}${prevContext}`
}

export function formatFeedforward(ff: Feedforward): string {
  const constraints = ff.constraints && ff.constraints.length > 0
    ? `\nConstraints:\n${ff.constraints.map((c) => `- ${c}`).join('\n')}`
    : ''
  return `Task: ${ff.task}

Acceptance criteria: ${ff.acceptanceCriteria}${constraints}

Complete this task. Your output will be evaluated against the acceptance criteria.`
}
