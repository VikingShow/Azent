import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createExperienceStore } from "../src/experience/store"

describe("ExperienceStore", () => {
  let dir: string
  let store: Awaited<ReturnType<typeof createExperienceStore>>

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "azent-exp-test-"))
    store = await createExperienceStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("records an experience entry", async () => {
    const id = await store.record({
      feedforward: "Build a blog system",
      output: "Created blog with Postgres and JWT auth",
      verified: true,
      projectId: "test-project",
    })
    expect(id).toBeDefined()
    expect(await store.count()).toBe(1)
  })

  it("searches by keyword", async () => {
    await store.record({
      feedforward: "Fix login bug",
      output: "Fixed JWT token validation",
      solution: "Added expiry check",
      verified: true,
      projectId: "test",
    })
    await store.record({
      feedforward: "Build a blog system",
      output: "Created CRUD for posts",
      verified: true,
      projectId: "test",
    })

    const results = await store.search("login", 5)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].feedforward).toContain("login")
  })

  it("returns empty for unknown id", async () => {
    const entry = await store.getById("nonexistent")
    expect(entry).toBeNull()
  })
})
