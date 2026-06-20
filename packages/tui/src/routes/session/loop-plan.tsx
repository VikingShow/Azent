import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"

export interface LoopPhase {
  id: string
  agent: string
  feedforward: string
  acceptance: string
  status: "pending" | "running" | "complete"
}

export interface LoopPlanData {
  phases: LoopPhase[]
  currentPhase: number
  planPath?: string
}

interface LoopPlanCardProps {
  plan: LoopPlanData | null
}

export function LoopPlanCard(props: LoopPlanCardProps) {
  const { theme } = useTheme()

  const phaseIcon = (status: LoopPhase["status"], isCurrent: boolean) => {
    if (status === "complete") return { char: "✓", color: theme.success }
    if (status === "running") return { char: "▶", color: theme.primary }
    if (isCurrent) return { char: "○", color: theme.text }
    return { char: "○", color: theme.textMuted }
  }

  return (
    <Show when={props.plan}>
      <box flexDirection="column" paddingX={1} paddingY={1} marginTop={1}>
        <text fg={theme.text} bold>
          {" "}⟳ Loop Plan
        </text>
        <Show when={props.plan!.planPath}>
          <text fg={theme.textMuted}>  File: {props.plan!.planPath}</text>
        </Show>
        <For each={props.plan!.phases}>
          {(phase, index) => {
            const isCurrent = index() === props.plan!.currentPhase
            const icon = phaseIcon(phase.status, isCurrent)
            return (
              <box flexDirection="row" gap={1} marginTop={1}>
                <text fg={icon.color}>{icon.char}</text>
                <text fg={isCurrent ? theme.text : theme.textMuted}>
                  {phase.id}
                  <text fg={theme.textMuted}> ({phase.agent})</text>
                </text>
                <Show when={phase.feedforward}>
                  <text fg={theme.textMuted}>— {phase.feedforward}</text>
                </Show>
              </box>
            )
          }}
        </For>
      </box>
    </Show>
  )
}
