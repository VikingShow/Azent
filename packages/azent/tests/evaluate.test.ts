import { describe, it, expect } from "bun:test"
import { evaluateOutput } from "../src/session/loop/evaluate"

describe("evaluateOutput", () => {
  it("returns fail for empty output", () => {
    const r = evaluateOutput("", "Build a blog", "Output must be meaningful")
    expect(r.passed).toBe(false)
    expect(r.score).toBe(0)
  })

  it("returns pass when output matches acceptance criteria", () => {
    const r = evaluateOutput(
      "Designed the blog system architecture with PostgreSQL database and JWT authentication",
      "Design blog system architecture",
      "PostgreSQL database design with JWT authentication",
    )
    expect(r.passed).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(60)
  })

  it("returns lower score when output doesn't match feedforward", () => {
    const r = evaluateOutput(
      "Discussed the weather and coffee preferences",
      "Implement REST API for user management",
      "API endpoints must be documented",
    )
    expect(r.score).toBeLessThan(60)
  })
})
