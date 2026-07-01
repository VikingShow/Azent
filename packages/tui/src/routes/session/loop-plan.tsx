import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { ContrastBar } from "../../component/loop-contrast"

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

const SPINNER_FRAMES = ["⟳", "⟲", "⟳", "⟲"]

function LoopSpinner() {
  const [frame, setFrame] = createSignal(0)
  const { theme } = useTheme()

  onMount(() => {
    const interval = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 300)
    onCleanup(() => clearInterval(interval))
  })

  return <text fg={theme.primary}>{SPINNER_FRAMES[frame()]}</text>
}

export function LoopPlanCard(props: LoopPlanCardProps) {
  const { theme } = useTheme()

  const phaseIcon = (status: LoopPhase["status"], isCurrent: boolean) => {
    if (status === "complete") return { char: "✓", color: theme.success }
    if (status === "running") return { char: "▶", color: theme.primary }
    if (isCurrent) return { char: "○", color: theme.text }
    return { char: "○", color: theme.textMuted }
  }

  const runningCount = createMemo(() => props.plan?.phases.filter((p) => p.status === "running").length ?? 0)
  const completeCount = createMemo(() => props.plan?.phases.filter((p) => p.status === "complete").length ?? 0)
  const totalCount = () => props.plan?.phases.length ?? 0
  const progressPct = () => (totalCount() > 0 ? Math.round((completeCount() / totalCount()) * 100) : 0)

  return (
    <Show when={props.plan}>
      <box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        marginTop={1}
        marginBottom={1}
        border={["left"]}
        borderColor={theme.border}
      >
        {/* Header with spinner */}
        <box flexDirection="row" gap={1}>
          <Show when={runningCount() > 0} fallback={<text fg={theme.success}>✓</text>}>
            <LoopSpinner />
          </Show>
          <text fg={theme.text}>Loop Plan</text>
          <text fg={theme.textMuted}>
            ({completeCount()}/{totalCount()} phases)
          </text>
        </box>

        {/* Plan path */}
        <Show when={props.plan!.planPath}>
          <text fg={theme.textMuted}>  File: {props.plan!.planPath}</text>
        </Show>

        {/* Separator */}
        <box height={1} />

        {/* Phase list */}
        <For each={props.plan!.phases}>
          {(phase, index) => {
            const isCurrent = index() === props.plan!.currentPhase
            const icon = phaseIcon(phase.status, isCurrent)
            return (
              <box flexDirection="row" gap={1}>
                <text fg={icon.color}>{icon.char}</text>
                <text fg={isCurrent ? theme.text : phase.status === "complete" ? theme.success : theme.textMuted}>
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

        {/* Progress bar */}
        <Show when={totalCount() > 0}>
          <box height={1} />
          <ContrastBar label="Overall" value={progressPct()} target={100} />
        </Show>
      </box>
    </Show>
  )
}
