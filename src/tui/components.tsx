import React, { useState, useEffect } from 'react'
import { Text, Box, Newline } from 'ink'
import type { LoopPhaseResult, AzentConfig } from '../config/types.js'

const RAINBOW = ['#ff0000', '#ff8800', '#ffff00', '#00e000', '#0088ff', '#4040ff', '#8800ff', '#ff0088'] as const
const COSMIC = '#3d5a80'

const TOP_SEGS = ['╔══════', '══════', '══════', '══════', '═══════', '═══════', '═══════', '══════╗']
const BOT_SEGS = ['╚══════', '══════', '══════', '══════', '═══════', '═══════', '═══════', '══════╝']

const A = ['  ███  ', ' █   █ ', '█     █', '███████', '█     █', '█     █']
const Z = ['███████', '     █ ', '    █  ', '   █   ', '  █    ', '███████']
const E = ['███████', '█      ', '███████', '█      ', '█      ', '███████']
const N = ['█     █', '██    █', '█ █   █', '█  █  █', '█   █ █', '█    ██']
const T = ['███████', '   █   ', '   █   ', '   █   ', '   █   ', '   █   ']

function rc(idx: number, frame: number) {
  return RAINBOW[(idx + frame) % 8]
}

export function SplashHeader({
  config,
  version,
}: {
  config: AzentConfig
  version: string
}) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 8), 120)
    return () => clearInterval(t)
  }, [])

  const aCount = Object.keys(config.agents).length
  const lCount = Object.keys(config.loops).length
  const info = `v${version} · ${aCount} agents · ${lCount} loop templates`

  return (
    <Box flexDirection="column">
      {/* top border */}
      <Box>{TOP_SEGS.map((s, i) => <Text key={i} color={rc(i, frame)}>{s}</Text>)}</Box>

      {/* AZENT rows */}
      {[0, 1, 2, 3, 4, 5].map(row => (
        <Box key={row}>
          <Text color={rc(0, frame)}>║ </Text>
          <Text>   </Text>
          <Text color={rc(1, frame)}>{A[row]}  </Text>
          <Text color={COSMIC}>{Z[row]}  </Text>
          <Text color={COSMIC}>{E[row]}  </Text>
          <Text color={COSMIC}>{N[row]}  </Text>
          <Text color={rc(6, frame)}>{T[row]}   </Text>
          <Text color={rc(7, frame)}> ║</Text>
        </Box>
      ))}

      {/* info */}
      <Box>
        <Text color={rc(0, frame)}>║ </Text>
        <Text>   </Text>
        <Text dimColor>{info.padEnd(46)}</Text>
        <Text color={rc(7, frame)}> ║</Text>
      </Box>

      {/* bottom border */}
      <Box>{BOT_SEGS.map((s, i) => <Text key={i} color={rc(i, frame)} dimColor>{s}</Text>)}</Box>
    </Box>
  )
}

export function MessageList({ messages }: { messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string }> }) {
  return (
    <Box flexDirection="column" gap={0}>
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="row">
          <Text dimColor>[{msg.role}]</Text>
          <Text> </Text>
          <Text color={msg.role === 'user' ? 'green' : msg.role === 'assistant' ? 'blue' : 'yellow'}>
            {msg.text}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

export function PhaseStatus({ phases }: { phases: LoopPhaseResult[] }) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">Loop Phases:</Text>
      {phases.map((phase, i) => (
        <Box key={i} flexDirection="row">
          <Text color={phase.passed ? 'green' : 'red'}>
            {phase.passed ? '\u2713' : '\u2717'}
          </Text>
          <Text> {phase.phaseId} ({phase.agentId})</Text>
          {phase.retries > 0 && (
            <Text dimColor> retries: {phase.retries}</Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

export function ApprovalPrompt({
  toolName,
  args,
  onApprove,
  onDecline,
}: {
  toolName: string
  args: Record<string, unknown>
  onApprove: () => void
  onDecline: () => void
}) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
      <Text bold color="yellow">Approval Required</Text>
      <Text>Tool: <Text bold>{toolName}</Text></Text>
      <Text>Args: {JSON.stringify(args)}</Text>
      <Newline />
      <Text>[y] Approve  [n] Decline</Text>
    </Box>
  )
}

export function StatusLine({ status }: { status: string }) {
  return (
    <Box>
      <Text dimColor color="gray">{status}</Text>
    </Box>
  )
}

export function Spinner({ label }: { label: string }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % 4), 120)
    return () => clearInterval(timer)
  }, [])
  const frames = ['\u280b', '\u2819', '\u2839', '\u2838']
  return (
    <Box>
      <Text color="cyan">{frames[frame]}</Text>
      <Text> {label}</Text>
    </Box>
  )
}

export function InputPrompt({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [input, setInput] = useState('')
  useEffect(() => {
    const { stdin } = process
    const onData = (data: Buffer) => {
      const char = data.toString()
      if (char === '\r' || char === '\n') {
        if (input.trim()) {
          onSubmit(input.trim())
          setInput('')
        }
      } else if (char === '\u007f' || char === '\b') {
        setInput((prev) => prev.slice(0, -1))
      } else if (char >= ' ' && char !== '\u001b') {
        setInput((prev) => prev + char)
      }
    }
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.on('data', onData)
    return () => {
      stdin.setRawMode?.(false)
      stdin.removeListener('data', onData)
    }
  }, [input, onSubmit])
  return (
    <Box>
      <Text color="cyan">{'> '}</Text>
      <Text>{input}</Text>
      <Text color="gray">_</Text>
    </Box>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <Box borderStyle="single" borderColor="red" paddingX={1} marginY={1}>
      <Text color="red" bold>Error: </Text>
      <Text color="red">{message}</Text>
    </Box>
  )
}
