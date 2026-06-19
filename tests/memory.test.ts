import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { LibSQLVector } from '@mastra/libsql'
import { rmSync } from 'fs'
import { join } from 'path'
import { createProjectMemory } from '../src/memory/project.js'
import { createExperienceStore } from '../src/memory/experience.js'
import { createConsolidator, shouldConsolidate } from '../src/memory/consolidate.js'
import type { ProjectMemoryStore } from '../src/memory/project.js'
import type { ExperienceStore } from '../src/memory/experience.js'

const tmpDbPath = join(import.meta.dir, '..', '.tmp-memory-test.db')

afterAll(() => {
  rmSync(tmpDbPath, { force: true })
  rmSync(tmpDbPath + '-wal', { force: true })
  rmSync(tmpDbPath + '-shm', { force: true })
})

describe('project memory', () => {
  let store: ProjectMemoryStore
  let vector: LibSQLVector

  beforeAll(async () => {
    vector = new LibSQLVector({ id: 'test-vector', url: `file:${tmpDbPath}` })
    store = await createProjectMemory(vector)
  }, 60000)

  test('add and search project memory', async () => {
    await store.add('This is a Next.js project using Prisma ORM', 'architecture', 'manual')
    await store.add('Code style: use semicolons, 2-space indent', 'convention', 'manual')
    await store.add('API routes are in app/api directory', 'structure', 'auto')

    const results = await store.search('What ORM does this project use?')
    expect(results.length).toBeGreaterThan(0)
  }, 30000)

  test('markStale marks entries as stale', async () => {
    const id = await store.add('Temporary entry to mark stale', 'test', 'manual')
    await store.markStale(id)
    const results = await store.search('Temporary entry')
    const entry = results.find((r) => r.id === id)
    expect(entry).toBeDefined()
    expect(entry!.stale).toBe(true)
  }, 30000)

  test('markStaleByCategory marks category entries', async () => {
    await store.add('Convention entry 1', 'test-category', 'manual')
    await store.add('Convention entry 2', 'test-category', 'manual')
    await store.markStaleByCategory('test-category')
    const results = await store.search('Convention entry')
    const testEntries = results.filter((r) => r.category === 'test-category')
    expect(testEntries.length).toBeGreaterThan(0)
    for (const entry of testEntries) {
      expect(entry.stale).toBe(true)
    }
  }, 30000)
})

describe('experience memory', () => {
  let store: ExperienceStore
  let vector: LibSQLVector

  beforeAll(async () => {
    vector = new LibSQLVector({ id: 'test-vector-2', url: `file:${tmpDbPath}` })
    store = await createExperienceStore(vector)
  }, 60000)

  test('record and search experiences', async () => {
    await store.record({
      feedforward: 'Fix Stripe webhook signature verification',
      output: 'Added timestamp tolerance check',
      problem: 'Webhook signatures expired due to clock drift',
      solution: 'Use 5-minute tolerance window',
      verified: true,
      projectId: 'test-project',
    })

    await store.record({
      feedforward: 'Implement user authentication',
      output: 'JWT-based auth with refresh tokens',
      solution: 'Use jose library for JWT signing',
      verified: true,
      projectId: 'test-project',
    })

    const results = await store.search('Stripe webhook issue')
    expect(results.length).toBeGreaterThan(0)
  }, 30000)

  test('count returns number of experiences', async () => {
    const count = await store.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('shouldConsolidate returns false below threshold', async () => {
    const result = await shouldConsolidate(store, 100)
    expect(result).toBe(false)
  })

  test('shouldConsolidate returns true at or above threshold', async () => {
    const result = await shouldConsolidate(store, 1)
    expect(result).toBe(true)
  })
})

describe('consolidator', () => {
  test('createConsolidator returns consolidator with method', async () => {
    const vector = new LibSQLVector({ id: 'test-vector-3', url: `file:${tmpDbPath}` })
    const consolidator = await createConsolidator(vector)
    expect(typeof consolidator.consolidateExperiences).toBe('function')
  })
})
