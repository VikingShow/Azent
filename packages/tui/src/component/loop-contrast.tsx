import { createMemo, Show } from "solid-js"
import { useTheme } from "../context/theme"

interface ContrastBarProps {
  label: string
  value: number        // 0-100, the actual score (feedback)
  target?: number      // default 100 (feedforward)
}

export function ContrastBar(props: ContrastBarProps) {
  const { theme } = useTheme()
  const target = () => props.target ?? 100
  const gap = () => Math.max(0, target() - props.value)
  const color = () => gap() < 20 ? theme.success : gap() < 50 ? theme.warning : theme.error
  const width = 20

  const fill = () => Math.round((props.value / 100) * width)
  const empty = () => width - fill()

  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.textMuted} minWidth={12}>
        {props.label}:
      </text>
      <text fg={color()}>
        {"["}
        <text fg={theme.success}>{Array(fill()).fill("▓").join("")}</text>
        <text fg={theme.textMuted}>{Array(empty()).fill("░").join("")}</text>
        {"]"}
      </text>
      <text fg={color()} minWidth={4}>
        {props.value}%
      </text>
      <Show when={gap() > 0}>
        <text fg={theme.textMuted}>
          gap: {gap()}%
        </text>
      </Show>
    </box>
  )
}
