import { describe, it, expect } from "bun:test"

interface LoopPhase {
  id: string
  agent: string
  feedforward: string
  acceptance: string
}

interface LoopPlan {
  phases: LoopPhase[]
  planPath?: string
}

interface PhaseResult {
  phaseId: string
  output: string
  passed: boolean
  feedback?: string
}

class InMemoryLoopStore {
  private plans = new Map<string, { plan: LoopPlan; current: number; results: PhaseResult[] }>()

  initLoop(sessionID: string, plan: LoopPlan) {
    this.plans.set(sessionID, { plan, current: 0, results: [] })
  }

  getPlan(sessionID: string): LoopPlan | undefined {
    return this.plans.get(sessionID)?.plan
  }

  getCurrentPhase(sessionID: string): LoopPhase | null {
    const s = this.plans.get(sessionID)
    if (!s || s.current >= s.plan.phases.length) return null
    return s.plan.phases[s.current]
  }

  advance(sessionID: string): LoopPhase | null {
    const s = this.plans.get(sessionID)
    if (!s || s.current >= s.plan.phases.length) return null
    const phase = s.plan.phases[s.current]
    s.current++
    return phase
  }

  completePhase(sessionID: string, result: PhaseResult) {
    const s = this.plans.get(sessionID)
    if (!s) return
    s.results.push(result)
  }

  getResults(sessionID: string): PhaseResult[] {
    return this.plans.get(sessionID)?.results ?? []
  }

  isComplete(sessionID: string): boolean {
    const s = this.plans.get(sessionID)
    return s ? s.current >= s.plan.phases.length : false
  }
}

describe("LoopEngine (pure logic)", () => {
  it("initializes a loop session", () => {
    const store = new InMemoryLoopStore()
    store.initLoop("s1", {
      phases: [
        { id: "architect", agent: "a1", feedforward: "Design", acceptance: "Review" },
        { id: "coder", agent: "a2", feedforward: "Implement", acceptance: "Test" },
      ],
    })
    expect(store.getPlan("s1")).toBeDefined()
    expect(store.getCurrentPhase("s1")!.id).toBe("architect")
  })

  it("advances through phases", () => {
    const store = new InMemoryLoopStore()
    store.initLoop("s2", {
      phases: [
        { id: "phase-1", agent: "a1", feedforward: "Task 1", acceptance: "Acc 1" },
        { id: "phase-2", agent: "a2", feedforward: "Task 2", acceptance: "Acc 2" },
      ],
    })

    expect(store.advance("s2")!.id).toBe("phase-1")
    store.completePhase("s2", { phaseId: "phase-1", output: "done", passed: true })
    expect(store.isComplete("s2")).toBe(false)

    expect(store.advance("s2")!.id).toBe("phase-2")
    store.completePhase("s2", { phaseId: "phase-2", output: "done", passed: true })
    expect(store.isComplete("s2")).toBe(true)

    expect(store.getResults("s2").length).toBe(2)
  })

  it("returns null when no more phases", () => {
    const store = new InMemoryLoopStore()
    store.initLoop("s3", {
      phases: [
        { id: "only", agent: "a1", feedforward: "Single", acceptance: "Done" },
      ],
    })
    store.advance("s3")
    store.completePhase("s3", { phaseId: "only", output: "done", passed: true })
    expect(store.isComplete("s3")).toBe(true)
    expect(store.getCurrentPhase("s3")).toBeNull()
  })
})
