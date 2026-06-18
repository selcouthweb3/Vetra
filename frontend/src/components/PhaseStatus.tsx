'use client'

import type { Phase } from '@/hooks/useVetra'
import type { Hex } from 'viem'

interface Props {
  phase: Phase
  txHash1: Hex | null
  txHash2: Hex | null
}

const EXPLORER = 'https://explorer.ritualfoundation.org/tx'

const phaseLabels: Record<Phase, string> = {
  idle:              '',
  'checking-cache':  'Checking cache...',
  'fetching-executor': 'Selecting TEE executor...',
  'tx1-pending':     'Submitting data fetch TX...',
  'tx1-settling':    'Waiting for HTTP precompile to settle...',
  'tx2-pending':     'Submitting LLM analysis TX...',
  'tx2-settling':    'Waiting for LLM precompile to settle...',
  done:              '',
  error:             '',
}

export function PhaseStatus({ phase, txHash1, txHash2 }: Props) {
  if (phase === 'idle' || phase === 'done' || phase === 'error') return null

  const label = phaseLabels[phase]

  const isStep1 = ['checking-cache', 'fetching-executor', 'tx1-pending', 'tx1-settling'].includes(phase)
  const isStep2 = ['tx2-pending', 'tx2-settling'].includes(phase)

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Step indicators */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <StepDot active={isStep1} done={!isStep1} label="1 · Fetch data" />
        <div style={{ flex: 1, height: '1px', background: '#374151', alignSelf: 'center' }} />
        <StepDot active={isStep2} done={false} label="2 · LLM score" />
      </div>

      {/* Status label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Spinner />
        <span style={{ color: '#9CA3AF', fontSize: '13px' }}>{label}</span>
      </div>

      {/* TX links */}
      {txHash1 && (
        <TxLink hash={txHash1} label="TX1 (fetch)" />
      )}
      {txHash2 && (
        <TxLink hash={txHash2} label="TX2 (LLM)" />
      )}
    </div>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const colour = active ? '#19D184' : done ? '#374151' : '#374151'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={{
        width: '10px', height: '10px', borderRadius: '50%',
        background: colour,
        border: active ? '2px solid #19D184' : '2px solid #374151',
        boxShadow: active ? '0 0 8px #19D184' : 'none',
      }} />
      <span style={{ fontSize: '10px', color: active ? '#19D184' : '#4B5563', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

function TxLink({ hash, label }: { hash: Hex; label: string }) {
  return (
    <a
      href={`${EXPLORER}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        marginTop: '8px',
        color: '#6B7280',
        fontSize: '11px',
        textDecoration: 'none',
      }}
    >
      {label}: <span style={{ color: '#9CA3AF', fontFamily: 'monospace' }}>{hash.slice(0, 18)}…</span>
    </a>
  )
}

function Spinner() {
  return (
    <div style={{
      width: '14px', height: '14px',
      border: '2px solid #374151',
      borderTopColor: '#19D184',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  )
}
