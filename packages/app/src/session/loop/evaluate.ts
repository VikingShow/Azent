export interface EvalResult {
  passed: boolean
  score: number    // 0-100
  feedback: string
}

export function evaluateOutput(output: string, feedforward: string, acceptance: string): EvalResult {
  // Minimum viability checks
  if (!output || output.length < 10) {
    return { passed: false, score: 0, feedback: "Output too short to be valid" }
  }

  // Check if acceptance criteria keywords appear in output (simple heuristic)
  const acceptanceWords = acceptance.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  const outputLower = output.toLowerCase()
  let matched = 0
  for (const word of acceptanceWords) {
    if (outputLower.includes(word)) matched++
  }

  const score = acceptanceWords.length > 0
    ? Math.round((matched / acceptanceWords.length) * 100)
    : 50  // no criteria to check, assume half

  // Check if output mentions the core task
  const taskWords = feedforward.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
  let taskMatched = 0
  for (const word of taskWords) {
    if (outputLower.includes(word)) taskMatched++
  }
  const taskScore = taskWords.length > 0
    ? Math.round((taskMatched / taskWords.length) * 100)
    : 50

  const finalScore = Math.round((score + taskScore) / 2)
  const passed = finalScore >= 60

  return {
    passed,
    score: finalScore,
    feedback: passed
      ? `Output meets criteria (${finalScore}% match)`
      : `Output only partially meets criteria (${finalScore}% match). Missing key topics.`,
  }
}
