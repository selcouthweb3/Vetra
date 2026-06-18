'use client'

import { type VerdictResult, scoreToVerdict, verdictConfig } from '@/lib/ritual'

interface Props {
  verdict: VerdictResult
  cachedAddress: string
}

export function VerdictCard({ verdict, cachedAddress }: Props) {
  const level  = scoreToVerdict(verdict.score)
  const config = verdictConfig[level]

  return (
    <div
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: '12px',
        padding: '24px',
        marginTop: '24px',
      }}
    >
      {/* Address */}
      <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '12px', wordBreak: 'break-all' }}>
        {cachedAddress}
      </p>

      {/* Verdict badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span
          style={{
            color: config.colour,
            fontWeight: 700,
            fontSize: '22px',
            letterSpacing: '0.05em',
          }}
        >
          {config.label}
        </span>
        <span
          style={{
            color: '#1F2937',
            background: config.colour,
            borderRadius: '100px',
            padding: '2px 12px',
            fontWeight: 700,
            fontSize: '14px',
          }}
        >
          {verdict.score}/100
        </span>
      </div>

      {/* Score bar */}
      <div style={{ background: '#1F2937', borderRadius: '4px', height: '6px', marginBottom: '16px' }}>
        <div
          style={{
            background: config.colour,
            width: `${Math.max(2, verdict.score)}%`,
            height: '100%',
            borderRadius: '4px',
            transition: 'width 0.8s ease',
          }}
        />
      </div>

      {/* Reason */}
      {verdict.reason && (
        <p style={{ color: '#D1D5DB', fontSize: '14px', lineHeight: 1.6 }}>
          {verdict.reason}
        </p>
      )}

      {/* Error state */}
      {verdict.error && (
        <p style={{ color: '#EF4444', fontSize: '13px', marginTop: '8px' }}>
          ⚠ {verdict.error}
        </p>
      )}

      {/* Disclaimer */}
      <p style={{ color: '#6B7280', fontSize: '11px', marginTop: '16px' }}>
        Scored on-chain via Ritual LLM precompile · Not financial advice
      </p>
    </div>
  )
}
