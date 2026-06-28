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
import type { ZenGate } from '../zen/index.js'

export interface LoopRunOptions {
  loopId: string
  task: string
  maxRetries?: number
  hooks?: SupervisorHooks
  experience?: ExperienceEntry[]
  zenGate?: ZenGate
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
  const { loopId, task, maxRetries = 3, hooks, zenGate } = options
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

    if (zenGate && !zenGate.isOpen) {
      const gateResult = await zenGate.check(task)
      if (!gateResult.allowed) {
        const result: LoopPhaseResult = {
          phaseId: phase.id,
          agentId: phase.agent,
          output: '',
          passed: false,
          feedback: `Zen Gate blocked: ${gateResult.reason}`,
          retries: 0,
        }
        results.push(result)
        return {
          loopId,
          task,
          phases: results,
          success: false,
          summary: '',
          error: result.feedback,
        }
      }
      zenGate.open()
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
      supervisor,
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
  evaluator: Agent,
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

      const evaluation = await evaluateOutput(evaluator, feedforward, lastOutput)

      if (evaluation.passed) {
        const result: LoopPhaseResult = {
          phaseId: feedforward.phaseId,
          agentId: feedforward.agentId,
          output: lastOutput,
          passed: true,
          retries,
          feedback: evaluation.feedback,
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
  evaluator: Agent,
  feedforward: Feedforward,
  output: string,
): Promise<{ passed: boolean; feedback: string; score: number }> {
  if (!output || output.trim().length < 10) {
    return { passed: false, feedback: 'Output too short to be valid', score: 0 }
  }

  const criteria = feedforward.acceptanceCriteria
  const task = feedforward.task

  try {
    const evalPrompt = `You are an impartial evaluator. Assess the following agent output against the acceptance criteria.

TASK:
${task.slice(0, 500)}

ACCEPTANCE CRITERIA:
${criteria}

AGENT OUTPUT:
${output.slice(0, 3000)}

Evaluate on these dimensions:
1. Completeness: Does the output address all parts of the task?
2. Correctness: Does it meet each acceptance criterion?
3. Quality: Is the output clear, well-structured, and actionable?

Return your answer as JSON:
{
  "passed": true or false,
  "score": 0-100,
  "feedback": "specific, actionable feedback. If passed, briefly confirm. If not passed, explain what's missing and how to fix it."
}`

    const response = await evaluator.generate(evalPrompt, { maxSteps: 3 })
    const text = response.text.trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        passed: Boolean(parsed.passed),
        score: Number(parsed.score) || 0,
        feedback: parsed.feedback || (parsed.passed ? 'Output meets criteria' : 'Output does not fully meet criteria'),
      }
    }

    const passed = text.toLowerCase().includes('"passed": true') || text.toLowerCase().includes('"passed":true')
    return {
      passed,
      score: passed ? 70 : 30,
      feedback: text.slice(0, 300),
    }
  } catch {
    const acceptanceWords = criteria.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    const outputLower = output.toLowerCase()
    let matched = 0
    for (const word of acceptanceWords) {
      if (outputLower.includes(word)) matched++
    }
    const score = acceptanceWords.length > 0
      ? Math.round((matched / acceptanceWords.length) * 100)
      : 50

    return {
      passed: score >= 60,
      score,
      feedback: score >= 60
        ? `Output meets criteria (${score}% keyword match)`
        : `Output partially meets criteria (${score}% keyword match). Missing key topics.`,
    }
  }
}

async function generateSummary(
  supervisor: Agent,
  task: string,
  results: LoopPhaseResult[],
): Promise<string> {
  const phaseSummaries = results
    .map((r) => `[${r.phaseId}] ${r.passed ? 'PASS' : 'FAIL'} (score: ${(r as any).score ?? 'N/A'}): ${r.output.slice(0, 200)}...`)
    .join('\n')

  try {
    const response = await supervisor.generate(
      `Task: ${task}\n\nPhase results:\n${phaseSummaries}\n\nSummarize the outcome concisely in Chinese.`,
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
    ? `\n\nPrevious phase outputs:\n${previousResults.map((r) => `[${r.phaseId}] ${r.passed ? 'PASS' : 'FAIL'}: ${r.output.slice(0, 500)}`).join('\n')}`
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
