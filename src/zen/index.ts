export interface ZenGate {
  isOpen: boolean
  check(task: string): Promise<{ allowed: boolean; reason?: string }>
  open(): void
  close(reason?: string): void
}

export interface BoundaryDeclaration {
  understanding: string
  assumptions: string[]
  implicitKnowledge: ImplicitKnowledgeItem[]
  plan: string
  unknowns: UnknownItem[]
}

export interface ImplicitKnowledgeItem {
  domain: string
  whatIKnow: string
  source: 'training_data' | 'current_context' | 'project_analysis' | 'past_experience' | 'common_convention'
  confidence: 'high' | 'medium' | 'low'
}

export interface UnknownItem {
  topic: string
  whyImportant: string
  suggestedQuestion: string
}

export interface PinnedInstruction {
  id: string
  content: string
  priority: 'critical' | 'high' | 'medium'
  pinnedAt: number
  scope: 'session' | 'agent_turn'
}

export interface DriftReport {
  driftDetected: boolean
  violatedInstructions: {
    instruction: string
    violation: string
    possibleCause: 'context_window_overflow' | 'attention_dilution' | 'instruction_conflict' | 'mid_conversation_override'
  }[]
  suggestedFix: string
}

export interface ZenState {
  gateOpen: boolean
  boundary?: BoundaryDeclaration
  pinnedInstructions: PinnedInstruction[]
  confidenceLevel: 'high' | 'medium' | 'low' | 'unknown'
}

export interface ZenLayer {
  state: ZenState

  declareBoundary(declaration: BoundaryDeclaration): void
  gate(open: boolean, reason?: string): void
  pin(instruction: PinnedInstruction): void
  reinjectPinnedInstructions(): string
  getActivePins(): PinnedInstruction[]
  getInspirations(experiences: { feedforward: string; solution?: string }[]): string
  renderContext(): string
}

export function createZenLayer(): ZenLayer {
  const state: ZenState = {
    gateOpen: false,
    pinnedInstructions: [],
    confidenceLevel: 'unknown',
  }

  return {
    state,

    declareBoundary(declaration: BoundaryDeclaration) {
      state.boundary = declaration
      const hasUncertainties = declaration.unknowns.length > 0
      const hasLowConfidence = declaration.implicitKnowledge.some((k) => k.confidence === 'low')

      if (hasUncertainties || hasLowConfidence) {
        state.gateOpen = false
        state.confidenceLevel = 'low'
      } else {
        state.confidenceLevel = declaration.implicitKnowledge.every((k) => k.confidence === 'high')
          ? 'high'
          : 'medium'
      }
    },

    gate(open: boolean, reason?: string) {
      state.gateOpen = open
      if (!open && reason) {
        state.boundary = undefined
      }
    },

    pin(instruction: PinnedInstruction) {
      state.pinnedInstructions.push(instruction)
    },

    reinjectPinnedInstructions(): string {
      if (state.pinnedInstructions.length === 0) return ''
      const active = state.pinnedInstructions
        .sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2 }
          return order[a.priority] - order[b.priority]
        })
      return [
        '<zen_pinned>',
        'The following instructions MUST be followed. They have been pinned to prevent context drift.',
        ...active.map((p) => `[${p.priority.toUpperCase()}] ${p.content}`),
        '</zen_pinned>',
      ].join('\n')
    },

    getActivePins(): PinnedInstruction[] {
      return [...state.pinnedInstructions]
    },

    getInspirations(experiences: { feedforward: string; solution?: string }[]): string {
      if (experiences.length === 0) return ''
      return [
        '<zen_experience>',
        'Past experiences that may be relevant:',
        ...experiences.map((e) => `- ${e.feedforward}${e.solution ? ` → ${e.solution}` : ''}`),
        '</zen_experience>',
      ].join('\n')
    },

    renderContext(): string {
      const parts: string[] = []

      parts.push('<zen_layer>')

      parts.push(`Gate: ${state.gateOpen ? 'OPEN' : 'CLOSED'}`)

      if (!state.gateOpen) {
        parts.push('ACTION REQUIRED: You must declare your boundary (understanding, assumptions, plan) before executing destructive actions.')
      }

      if (state.boundary) {
        parts.push(`Understanding: ${state.boundary.understanding.slice(0, 200)}`)
        if (state.boundary.implicitKnowledge.length > 0) {
          parts.push('Implicit knowledge sources:')
          for (const k of state.boundary.implicitKnowledge) {
            parts.push(`  - ${k.domain}: "${k.whatIKnow}" (source: ${k.source}, confidence: ${k.confidence})`)
          }
        }
        if (state.boundary.unknowns.length > 0) {
          parts.push('Uncertainties that need clarification:')
          for (const u of state.boundary.unknowns) {
            parts.push(`  - ${u.topic}: ${u.suggestedQuestion}`)
          }
        }
      }

      if (state.pinnedInstructions.length > 0) {
        parts.push('Pinned instructions (must not be violated):')
        for (const p of state.pinnedInstructions) {
          parts.push(`  [${p.priority}] ${p.content}`)
        }
      }

      parts.push('</zen_layer>')

      return parts.join('\n')
    },
  }
}
