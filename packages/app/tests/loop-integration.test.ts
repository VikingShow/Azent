import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { evaluateOutput } from "../src/session/loop/evaluate"
import { createLoopConfigStore } from "../src/session/loop/store"
import { createExperienceStore } from "../src/experience/store"

describe("Loop Integration (config → engine → evaluate → store)", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "azent-int-"))
  })

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  it("full loop lifecycle: plan → execute → evaluate → persist -> Store", async () => {
    // 1. Save a loop config
    const configStore = await createLoopConfigStore(dataDir)
    await configStore.write({
      id: "blog-system",
      name: "Blog System",
      phases: [
        { id: "architect", agent: "deepseek", feedforward: "Design blog architecture", acceptance: "Database design" },
        { id: "coder", agent: "gpt-4o", feedforward: "Implement blog code", acceptance: "REST API endpoints" },
      ],
      createdAt: Date.now(),
    })

    // 2. Read it back
    const loaded = await configStore.read("blog-system")
    expect(loaded).toBeDefined()
    expect(loaded!.phases.length).toBe(2)

    // 3. Evaluate phase 1 output
    const phase1Output = "Designed blog with PostgreSQL database and user authentication"
    const eval1 = evaluateOutput(phase1Output, loaded!.phases[0].feedforward, loaded!.phases[0].acceptance)
    expect(eval1.passed).toBe(true)
    expect(eval1.score).toBeGreaterThanOrEqual(60)

    // 4. Evaluate phase 2 output
    const phase2Output = "Implemented REST API with CRUD endpoints for blog posts"
    const eval2 = evaluateOutput(phase2Output, loaded!.phases[1].feedforward, loaded!.phases[1].acceptance)
    expect(eval2.passed).toBe(true)
    expect(eval2.score).toBeGreaterThanOrEqual(60)

    // 5. Record to experience store
    const expStore = await createExperienceStore(dataDir)
    const expId = await expStore.record({
      feedforward: "Build a blog system",
      output: "Completed blog with PostgreSQL and REST API",
      solution: `${phase1Output}\n${phase2Output}`,
      verified: eval1.passed && eval2.passed,
      projectId: "integration-test",
    })
    expect(expId).toBeDefined()

    // 6. Search experience store
    const results = await expStore.search("blog database", 5)
    expect(results.length).toBeGreaterThanOrEqual(1)
    const found = results[0]
    expect(found.feedforward).toBe("Build a blog system")
    expect(found.verified).toBe(true)

    // 7. List loop configs
    const configs = await configStore.list()
    expect(configs.length).toBe(1)
    expect(configs[0].id).toBe("blog-system")
  })
})
