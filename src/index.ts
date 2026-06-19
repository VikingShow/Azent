#!/usr/bin/env bun
import { render } from 'ink'
import React from 'react'
import { createMastraInstance, disconnectMcp } from './mastra.js'
import { createSupervisor } from './orchestrator/supervisor.js'
import { createLoopEngine } from './orchestrator/loop.js'
import { createExperienceStore } from './memory/experience.js'
import { AzentApp } from './tui/app.js'

async function main() {
  console.log('Starting Azent...')

  const { mastra, config, mcpClients } = await createMastraInstance()
  const supervisor = createSupervisor(mastra, config)
  const engine = createLoopEngine(mastra, config, supervisor)

  let experienceStore
  try {
    const { LibSQLVector } = await import('@mastra/libsql')
    const { join } = await import('path')
    const { existsSync, mkdirSync } = await import('fs')
    const memoryDir = join('.azent', 'memory')
    if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true })
    const vector = new LibSQLVector({
      id: 'azent-vector',
      url: `file:${join('.azent', 'mastra.db')}`,
    })
    experienceStore = await createExperienceStore(vector)
  } catch (e) {
    console.warn('Experience store init failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  const { waitUntilExit } = render(
    React.createElement(AzentApp, {
      engine,
      experienceStore,
      version: '0.1.0',
    }),
  )

  await waitUntilExit()
  await disconnectMcp(mcpClients)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
