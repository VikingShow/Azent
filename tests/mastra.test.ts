import { describe, test, expect, afterAll } from 'bun:test'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { createMastraInstance, disconnectMcp } from '../src/mastra.js'

const tmpProject = join(import.meta.dir, '..', '.tmp-mastra-test')

afterAll(() => {
  rmSync(tmpProject, { recursive: true, force: true })
})

describe('mastra instance', () => {
  test('createMastraInstance loads config and creates agents', async () => {
    mkdirSync(join(tmpProject, '.azent', 'config'), { recursive: true })

    const agentsYaml = `
agents:
  coder:
    id: coder
    name: Coder
    instructions: Test coder
    model: openai/gpt-4.1
    maxRetries: 1
    maxSteps: 5
    memory: true
  reviewer:
    id: reviewer
    name: Reviewer
    instructions: Test reviewer
    model: openai/gpt-4.1
global:
  defaultModel: openai/gpt-4.1
`
    writeFileSync(join(tmpProject, '.azent', 'config', 'agents.yaml'), agentsYaml)

    const loopsYaml = `
loops:
  test:
    name: Test Loop
    allowModification: false
    phases:
      - id: code
        name: Code
        acceptance: done
        agent: coder
`
    writeFileSync(join(tmpProject, '.azent', 'config', 'loops.yaml'), loopsYaml)

    const { mastra, config, mcpClients } = await createMastraInstance(tmpProject)

    expect(config.agents.coder).toBeDefined()
    expect(config.agents.reviewer).toBeDefined()
    expect(config.loops.test).toBeDefined()

    const coderAgent = mastra.getAgent('coder')
    expect(coderAgent).toBeDefined()
    expect(coderAgent.name).toBe('Coder')

    const reviewerAgent = mastra.getAgent('reviewer')
    expect(reviewerAgent).toBeDefined()
    expect(reviewerAgent.name).toBe('Reviewer')

    await disconnectMcp(mcpClients)
  })

  test('createMastraInstance throws on invalid config', async () => {
    mkdirSync(join(tmpProject, '.azent', 'config'), { recursive: true })

    const agentsYaml = `
agents:
  coder:
    id: coder
    name: Coder
    instructions: Test
    model: openai/gpt-4.1
`
    writeFileSync(join(tmpProject, '.azent', 'config', 'agents.yaml'), agentsYaml)

    const loopsYaml = `
loops:
  bad:
    name: Bad
    allowModification: false
    phases:
      - id: p1
        name: P1
        acceptance: ok
        agent: nonexistent
`
    writeFileSync(join(tmpProject, '.azent', 'config', 'loops.yaml'), loopsYaml)

    await expect(createMastraInstance(tmpProject)).rejects.toThrow()
  })
})
