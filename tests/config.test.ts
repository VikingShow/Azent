import { describe, test, expect } from 'bun:test'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import {
  agentConfigSchema,
  loopTemplateSchema,
  agentsFileSchema,
  loopsFileSchema,
  mcpServerSchema,
} from '../src/config/schema.js'
import { loadConfig, validateConfig } from '../src/config/loader.js'

describe('schema validation', () => {
  test('valid agent config passes', () => {
    const valid = {
      id: 'test-agent',
      name: 'Test Agent',
      instructions: 'You are a test agent.',
      model: 'openai/gpt-4.1',
    }
    expect(() => agentConfigSchema.parse(valid)).not.toThrow()
  })

  test('agent config requires id', () => {
    const invalid = { name: 'Test', instructions: '...', model: 'x' }
    expect(() => agentConfigSchema.parse(invalid)).toThrow()
  })

  test('agent config requires instructions', () => {
    const invalid = { id: 'x', name: 'Test', model: 'x' }
    expect(() => agentConfigSchema.parse(invalid)).toThrow()
  })

  test('requireApproval accepts boolean or string array', () => {
    const boolCfg = { id: 'x', name: 'X', instructions: 'i', model: 'm', requireApproval: true }
    const arrCfg = { id: 'y', name: 'Y', instructions: 'i', model: 'm', requireApproval: ['tool1'] }
    expect(() => agentConfigSchema.parse(boolCfg)).not.toThrow()
    expect(() => agentConfigSchema.parse(arrCfg)).not.toThrow()
  })

  test('mcpServer requires command or url', () => {
    expect(() => mcpServerSchema.parse({ command: 'npx', args: ['-y', 'pkg'] })).not.toThrow()
    expect(() => mcpServerSchema.parse({ url: 'http://localhost:3000' })).not.toThrow()
    expect(() => mcpServerSchema.parse({})).toThrow()
  })

  test('valid loop template passes', () => {
    const valid = {
      name: 'Test Loop',
      allowModification: true,
      phases: [
        { id: 'p1', name: 'Phase 1', acceptance: 'done', agent: 'coder' },
      ],
    }
    expect(() => loopTemplateSchema.parse(valid)).not.toThrow()
  })

  test('loop template requires at least one phase', () => {
    const invalid = { name: 'X', allowModification: false, phases: [] }
    expect(() => loopTemplateSchema.parse(invalid)).toThrow()
  })

  test('agents file schema parses example config', () => {
    const raw = readFileSync(join(import.meta.dir, '..', 'configs', 'agents.yaml'), 'utf-8')
    const yaml = parseYaml(raw)
    expect(() => agentsFileSchema.parse(yaml)).not.toThrow()
  })

  test('loops file schema parses example config', () => {
    const raw = readFileSync(join(import.meta.dir, '..', 'configs', 'loops.yaml'), 'utf-8')
    const yaml = parseYaml(raw)
    expect(() => loopsFileSchema.parse(yaml)).not.toThrow()
  })
})

describe('loader', () => {
  const tmpProject = join(import.meta.dir, '..', '.tmp-test-project')

  test('loadConfig merges project and global config', () => {
    mkdirSync(join(tmpProject, '.azent', 'config'), { recursive: true })

    const agentsYaml = `
agents:
  coder:
    id: coder
    name: Coder
    instructions: Test coder
    model: openai/gpt-4.1
global:
  defaultModel: openai/gpt-4.1
`
    writeFileSync(join(tmpProject, '.azent', 'config', 'agents.yaml'), agentsYaml)

    const loopsYaml = `
loops:
  quick:
    name: Quick
    allowModification: false
    phases:
      - id: do
        name: Do
        acceptance: done
        agent: coder
`
    writeFileSync(join(tmpProject, '.azent', 'config', 'loops.yaml'), loopsYaml)

    const config = loadConfig(tmpProject)
    expect(config.agents.coder).toBeDefined()
    expect(config.agents.coder.model).toBe('openai/gpt-4.1')
    expect(config.loops.quick).toBeDefined()
    expect(config.loops.quick.phases).toHaveLength(1)
    expect(config.global?.defaultModel).toBe('openai/gpt-4.1')

    rmSync(tmpProject, { recursive: true, force: true })
  })

  test('validateConfig detects unknown agent references', () => {
    const config = {
      agents: {
        coder: {
          id: 'coder', name: 'Coder', instructions: 'x', model: 'm',
        },
      },
      loops: {
        bad: {
          name: 'Bad',
          allowModification: false,
          phases: [
            { id: 'p1', name: 'P1', acceptance: 'ok', agent: 'nonexistent' },
          ],
        },
      },
    }
    const errors = validateConfig(config as any)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('nonexistent')
  })

  test('validateConfig passes with valid references', () => {
    const config = {
      agents: {
        coder: {
          id: 'coder', name: 'Coder', instructions: 'x', model: 'm',
        },
      },
      loops: {
        good: {
          name: 'Good',
          allowModification: false,
          phases: [
            { id: 'p1', name: 'P1', acceptance: 'ok', agent: 'coder' },
          ],
        },
      },
    }
    const errors = validateConfig(config as any)
    expect(errors).toEqual([])
  })
})
