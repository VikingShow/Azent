import { describe, it, expect } from "bun:test"
import { ConfigLoop, ConfigPhase } from "../packages/core/src/config/loop"

describe("Loop Config Schema", () => {
  it("validates a valid phase", () => {
    const phase = ConfigPhase.make({
      id: "architect",
      agent: "architect-agent",
      feedforward: "Design the system architecture",
      acceptance: "Architecture document must be reviewed",
    })
    expect(phase.id).toBe("architect")
    expect(phase.agent).toBe("architect-agent")
  })

  it("validates a valid loop template", () => {
    const loop = ConfigLoop.make({
      name: "code-review",
      phases: [
        { id: "architect", agent: "architect-agent", feedforward: "Design", acceptance: "Reviewed" },
        { id: "coder", agent: "coder-agent", feedforward: "Implement", acceptance: "Tests pass" },
      ],
    })
    expect(loop.phases.length).toBe(2)
    expect(loop.phases[0].id).toBe("architect")
  })

  it("rejects invalid phase (missing agent)", () => {
    expect(() =>
      (ConfigPhase as any).make({ id: "architect", feedforward: "Design", acceptance: "Reviewed" }),
    ).toThrow()
  })
})
