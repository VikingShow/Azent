import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoopConfigStore } from "../src/session/loop/store"

describe("LoopConfigStore", () => {
  let dir: string
  let store: Awaited<ReturnType<typeof createLoopConfigStore>>

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "azent-loop-test-"))
    store = await createLoopConfigStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes and reads a loop config", async () => {
    await store.write({
      id: "blog-system",
      name: "Blog System",
      phases: [
        { id: "architect", agent: "architect-agent", feedforward: "Design architecture", acceptance: "Reviewed" },
        { id: "coder", agent: "coder-agent", feedforward: "Implement code", acceptance: "Tests pass" },
      ],
      createdAt: Date.now(),
    })
    const loaded = await store.read("blog-system")
    expect(loaded).toBeDefined()
    expect(loaded!.phases.length).toBe(2)
  })

  it("lists all configs", async () => {
    await store.write({ id: "cfg1", name: "First", phases: [], createdAt: 1 })
    await store.write({ id: "cfg2", name: "Second", phases: [], createdAt: 2 })
    const list = await store.list()
    expect(list.length).toBe(2)
    expect(list[0].id).toBe("cfg2") // sorted by createdAt desc
  })

  it("removes a config", async () => {
    await store.write({ id: "temp", name: "Temp", phases: [], createdAt: 0 })
    await store.remove("temp")
    expect(await store.read("temp")).toBeNull()
  })
})
