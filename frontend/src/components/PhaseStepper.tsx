'use client'

import type { Phase } from '@/hooks/useVetra'
import type { Hex } from 'viem'

interface Props {
  phase: Phase
  txHash1: Hex | null
  txHash2: Hex | null
}

const EXPLORER = 'https://explorer.ritualfoundation.org/tx'

type Step = {
  id: string
  label: string
  sublabel: string
  phases: Phase[]
  settlingPhase?: Phase
}

const STEPS: Step[] = [
  {
    id: 'cache',
    label: 'Cache check',
    sublabel: 'Looking for prior result',
    phases: ['checking-cache'],
  },
  {
    id: 'fetch',
    label: 'Fetch data',
    sublabel: 'HTTP precompile',
    phases: ['fetching-executor', 'tx1-pending', 'tx1-settling'],
    settlingPhase: 'tx1-settling',
  },
  {
    id: 'ai',
    label: 'AI analysis',
    sublabel: 'LLM precompile',
    phases: ['tx2-pending', 'tx2-settling'],
    settlingPhase: 'tx2-settling',
  },
  {
    id: 'result',
    label: 'Result',
    sublabel: 'Cached on-chain',
    phases: ['done'],
  },
]

const PHASE_ORDER: Phase[] = [
  'idle', 'checking-cache', 'fetching-executor',
  'tx1-pending', 'tx1-settling',
  'tx2-pending', 'tx2-settling',
  'done', 'error',
]

function phaseIndex(p: Phase) {
  return PHASE_ORDER.indexOf(p)
}

export function PhaseStepper({ phase, txHash1, txHash2 }: Props) {
  if (phase === 'idle' || phase === 'done' || phase === 'error') return null

  const currentIdx = phaseIndex(phase)

  function stepState(step: Step): 'done' | 'active' | 'settling' | 'pending' {
    const firstPhase = step.phases[0]
    const lastPhase  = step.phases[step.phases.length - 1]
    const firstIdx   = phaseIndex(firstPhase)
    const lastIdx    = phaseIndex(lastPhase)

    if (currentIdx > lastIdx) return 'done'
    if (currentIdx >= firstIdx) {
      if (step.settlingPhase && phase === step.settlingPhase) return 'settling'
      return 'active'
    }
    return 'pending'
  }

  const statusLabel: Record<Phase, string> = {
    idle:                '',
    'checking-cache':    'Checking on-chain cache…',
    'fetching-executor': 'Selecting TEE executor…',
    'tx1-pending':       'Submitting TX1 — data fetch…',
    'tx1-settling':      'Waiting for HTTP precompile to settle…',
    'tx2-pending':       'Submitting TX2 — LLM analysis…',
    'tx2-settling':      'Waiting for LLM precompile to settle…',
    done:                '',
    error:               '',
  }

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      {/* Stepper */}
      <div className="flex items-start gap-0 mb-5">
        {STEPS.map((step, i) => {
          const state = stepState(step)
          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              {/* Node */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
                  state === 'done'     ? 'bg-violet-400 text-zinc-950' :
                  state === 'active'   ? 'bg-violet-400/20 border-2 border-violet-400 text-violet-400 ring-4 ring-violet-400/10' :
                  state === 'settling' ? 'bg-amber-400/20 border-2 border-amber-400 text-amber-400 ring-4 ring-amber-400/10' :
                                         'bg-zinc-800 border-2 border-zinc-700 text-zinc-600',
                ].join(' ')}>
                  {state === 'done' ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : state === 'active' || state === 'settling' ? (
                    <div className={`w-2 h-2 rounded-full ${state === 'settling' ? 'bg-amber-400' : 'bg-violet-400'} animate-pulse`} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-xs font-medium whitespace-nowrap ${
                    state === 'done' ? 'text-violet-400' :
                    state === 'active' ? 'text-violet-400' :
                    state === 'settling' ? 'text-amber-400' :
                    'text-zinc-600'
                  }`}>
                    {step.label}
                  </div>
                </div>
              </div>
              {/* Connector */}
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 mt-[-14px] transition-colors duration-300 ${
                  stepState(STEPS[i + 1]) !== 'pending' || state === 'done'
                    ? 'bg-violet-400/40'
                    : 'bg-zinc-700'
                }`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Current status */}
      <div className="flex items-center gap-2.5 text-sm text-zinc-400">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-600 border-t-violet-400 animate-[spin_0.8s_linear_infinite] shrink-0" />
        {statusLabel[phase]}
      </div>

      {/* TX links */}
      {(txHash1 || txHash2) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {txHash1 && (
            <a href={`${EXPLORER}/${txHash1}`} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors duration-200">
              <span className="text-zinc-700">TX1</span>
              {txHash1.slice(0, 10)}…{txHash1.slice(-6)}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          )}
          {txHash2 && (
            <a href={`${EXPLORER}/${txHash2}`} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors duration-200">
              <span className="text-zinc-700">TX2</span>
              {txHash2.slice(0, 10)}…{txHash2.slice(-6)}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          )}
        </div>
      )}
    </div>
  )
}
