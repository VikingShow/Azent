#!/usr/bin/env bun
import { render } from 'ink'
import React from 'react'
import { createMastraInstance, disconnectMcp } from './mastra.js'
import { createSupervisor } from './orchestrator/supervisor.js'
import { createLoopEngine } from './orchestrator/loop.js'
import { createExperienceStore } from './memory/experience.js'
import { AzentApp } from './tui/app.js'

const VERSION = '0.1.6'

if (typeof Bun === 'undefined') {
  console.error('Azent requires Bun. Install with: bun add -g @sowrjam/azent')
  console.error('Or run with: bunx @sowrjam/azent')
  process.exit(1)
}

async function checkUpdate() {
  try {
    const res = await fetch('https://registry.npmjs.org/@sowrjam/azent/latest')
    if (!res.ok) return
    const { version: latest } = await res.json() as { version: string }
    if (latest && latest !== VERSION) {
      console.error(`\x1b[33m\u26a0 Update: ${VERSION} \u2192 ${latest}\x1b[0m`)
      console.error(`\x1b[33m  Run: npm i -g @sowrjam/azent\x1b[0m`)
    }
  } catch { /* offline */ }
}

async function main() {
  await checkUpdate()

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
      config,
      version: VERSION,
    }),
  )

  await waitUntilExit()
  await disconnectMcp(mcpClients)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
