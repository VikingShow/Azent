import React, { useState, useCallback } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import {
  Header,
  MessageList,
  PhaseStatus,
  Spinner,
  StatusLine,
  InputPrompt,
  ErrorBox,
} from './components.js'
import type { LoopEngine } from '../orchestrator/loop.js'
import type { SupervisorHooks } from '../orchestrator/supervisor.js'
import type { ExperienceStore } from '../memory/experience.js'
import type { LoopPhaseResult, ExperienceEntry } from '../config/types.js'

interface AzentAppState {
  running: boolean
  status: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>
  phases: LoopPhaseResult[]
  error: string | null
  currentLoopId: string | null
}

export function AzentApp({
  engine,
  experienceStore,
  version = '0.1.0',
}: {
  engine: LoopEngine
  experienceStore?: ExperienceStore
  version?: string
}) {
  const { exit } = useApp()
  const [state, setState] = useState<AzentAppState>({
    running: false,
    status: 'Ready. Type a task or /help for commands.',
    messages: [],
    phases: [],
    error: null,
    currentLoopId: null,
  })

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
    }
  })

  const handleSubmit = useCallback(async (text: string) => {
    if (state.running) return

    if (text === '/exit' || text === '/quit') {
      exit()
      return
    }

    if (text === '/help') {
      setState((s) => ({
        ...s,
        messages: [...s.messages, {
          role: 'system',
          text: 'Commands: /exit, /help, /loops, or type a task to run a loop',
        }],
      }))
      return
    }

    if (text === '/loops') {
      setState((s) => ({
        ...s,
        messages: [...s.messages, {
          role: 'system',
          text: 'Available loop templates: code-review, quick-fix (configure in .azent/config/loops.yaml)',
        }],
      }))
      return
    }

    const loopId = state.currentLoopId || 'code-review'

    setState((s) => ({
      ...s,
      running: true,
      status: `Running loop "${loopId}"...`,
      messages: [...s.messages, { role: 'user', text }],
      phases: [],
      error: null,
    }))

    let experiences: ExperienceEntry[] = []
    if (experienceStore) {
      try {
        experiences = await experienceStore.search(text, 3)
      } catch {
        // Non-fatal
      }
    }

    const hooks: SupervisorHooks = {
      onPhaseStart: (phaseId, agentId) => {
        setState((s) => ({
          ...s,
          status: `Phase ${phaseId} -> ${agentId}...`,
        }))
      },
      onPhaseComplete: (result) => {
        setState((s) => ({
          ...s,
          phases: [...s.phases, result],
        }))
      },
      onPhaseRetry: (phaseId, attempt, feedback) => {
        setState((s) => ({
          ...s,
          status: `Retrying ${phaseId} (${attempt}): ${feedback}`,
        }))
      },
      onEscalate: (phaseId, reason) => {
        setState((s) => ({
          ...s,
          status: `Escalated: ${phaseId} - ${reason}`,
          error: reason,
        }))
      },
    }

    try {
      const result = await engine.run({
        loopId,
        task: text,
        hooks,
        experience: experiences,
      })

      if (result.success) {
        setState((s) => ({
          ...s,
          running: false,
          status: 'Done.',
          messages: [...s.messages, { role: 'assistant', text: result.summary }],
        }))

        if (experienceStore && result.phases.length > 0) {
          try {
            await experienceStore.record({
              feedforward: text,
              output: result.summary,
              solution: result.phases.map((p) => p.output.slice(0, 200)).join('\n'),
              verified: true,
              projectId: process.cwd(),
            })
          } catch {
            // Non-fatal
          }
        }
      } else {
        setState((s) => ({
          ...s,
          running: false,
          status: 'Failed.',
          error: result.error || 'Unknown error',
          messages: [...s.messages, { role: 'system', text: `Failed: ${result.error}` }],
        }))
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        running: false,
        status: 'Error.',
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  }, [state.running, state.currentLoopId, experienceStore, engine, exit])

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header version={version} />
      <Box marginY={1} flexDirection="column">
        <MessageList messages={state.messages} />
        {state.phases.length > 0 && <PhaseStatus phases={state.phases} />}
        {state.error && <ErrorBox message={state.error} />}
      </Box>
      <Box flexDirection="column">
        {state.running ? (
          <Spinner label={state.status} />
        ) : (
          <>
            <StatusLine status={state.status} />
            <InputPrompt onSubmit={handleSubmit} />
          </>
        )}
      </Box>
    </Box>
  )
}
