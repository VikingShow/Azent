import { describe, test, expect, mock } from 'bun:test'
import type { LoopPhaseResult, Feedforward, AzentConfig } from '../src/config/types.js'
import { formatFeedforward, createLoopEngine, type LoopRunOptions } from '../src/orchestrator/loop.js'

describe('loop engine', () => {
  test('formatFeedforward produces correct prompt', () => {
    const ff: Feedforward = {
      task: 'Write a function',
      acceptanceCriteria: 'Must pass tests',
      agentId: 'coder',
      phaseId: 'implement',
      constraints: ['Use TypeScript', 'No external deps'],
    }
    const result = formatFeedforward(ff)
    expect(result).toContain('Write a function')
    expect(result).toContain('Must pass tests')
    expect(result).toContain('Use TypeScript')
    expect(result).toContain('No external deps')
  })

  test('formatFeedforward without constraints', () => {
    const ff: Feedforward = {
      task: 'Review code',
      acceptanceCriteria: 'No bugs found',
      agentId: 'reviewer',
      phaseId: 'review',
    }
    const result = formatFeedforward(ff)
    expect(result).toContain('Review code')
    expect(result).toContain('No bugs found')
    expect(result).not.toContain('Constraints')
  })

  test('createLoopEngine returns engine with run function', () => {
    const mockConfig: AzentConfig = { agents: {}, loops: {} }
    const mockMastra = {
      getAgent: () => null,
    } as any
    const mockSupervisor = {} as any

    const engine = createLoopEngine(mockMastra, mockConfig, mockSupervisor)
    expect(typeof engine.run).toBe('function')
  })

  test('loop run returns error for unknown loop template', async () => {
    const mockConfig: AzentConfig = { agents: {}, loops: {} }
    const mockMastra = {
      getAgent: () => null,
    } as any
    const mockSupervisor = {} as any

    const engine = createLoopEngine(mockMastra, mockConfig, mockSupervisor)
    const result = await engine.run({ loopId: 'nonexistent', task: 'test' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown loop template')
    expect(result.phases).toEqual([])
  })

  test('loop run calls hooks for phase start and complete', async () => {
    const phaseStartCalls: string[] = []
    const phaseCompleteCalls: string[] = []

    const mockAgent = {
      generate: mock(async () => ({ text: 'This is a sufficiently long output that passes evaluation.' })),
    }

    const mockConfig: AzentConfig = {
      agents: {
        coder: {
          id: 'coder', name: 'Coder', instructions: 'x', model: 'm',
        },
      },
      loops: {
        test: {
          name: 'Test',
          allowModification: false,
          phases: [
            { id: 'p1', name: 'Phase 1', acceptance: 'done', agent: 'coder' },
          ],
        },
      },
    }

    const mockMastra = {
      getAgent: (id: string) => mockAgent,
    } as any

    const mockSupervisor = {
      generate: mock(async () => ({ text: 'Summary' })),
    } as any

    const engine = createLoopEngine(mockMastra, mockConfig, mockSupervisor)
    const result = await engine.run({
      loopId: 'test',
      task: 'test task',
      hooks: {
        onPhaseStart: async (phaseId) => { phaseStartCalls.push(phaseId) },
        onPhaseComplete: async (r) => { phaseCompleteCalls.push(r.phaseId) },
      },
    })

    expect(result.success).toBe(true)
    expect(phaseStartCalls).toEqual(['p1'])
    expect(phaseCompleteCalls).toEqual(['p1'])
  })

  test('loop run escalates on missing agent', async () => {
    const escalateCalls: string[] = []

    const mockConfig: AzentConfig = {
      agents: {},
      loops: {
        test: {
          name: 'Test',
          allowModification: false,
          phases: [
            { id: 'p1', name: 'Phase 1', acceptance: 'done', agent: 'missing' },
          ],
        },
      },
    }

    const mockMastra = {
      getAgent: () => null,
    } as any

    const mockSupervisor = {} as any

    const engine = createLoopEngine(mockMastra, mockConfig, mockSupervisor)
    const result = await engine.run({
      loopId: 'test',
      task: 'test',
      hooks: {
        onEscalate: async (phaseId) => { escalateCalls.push(phaseId) },
      },
    })

    expect(result.success).toBe(false)
    expect(escalateCalls).toEqual(['p1'])
    expect(result.error).toContain('not found')
  })
})

describe('supervisor', () => {
  test('createSupervisor builds instructions with agents and loops', async () => {
    const { createSupervisor } = await import('../src/orchestrator/supervisor.js')

    const mockConfig: AzentConfig = {
      agents: {
        coder: { id: 'coder', name: 'Coder', instructions: 'x', model: 'm', description: 'Writes code' },
      },
      loops: {
        dev: {
          name: 'Dev',
          allowModification: true,
          phases: [{ id: 'code', name: 'Code', acceptance: 'works', agent: 'coder' }],
        },
      },
      global: { defaultModel: 'openai/gpt-4.1' },
    }

    const mockAgent = { id: 'coder', name: 'Coder' }
    const mockMastra = {
      getAgent: () => mockAgent,
    } as any

    const supervisor = createSupervisor(mockMastra, mockConfig)
    expect(supervisor.id).toBe('supervisor')
    expect(supervisor.name).toBe('Supervisor')
  })
})
