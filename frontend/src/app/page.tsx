'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { useVetra } from '@/hooks/useVetra'
import { VerdictCard } from '@/components/VerdictCard'
import { PhaseStatus } from '@/components/PhaseStatus'
import dynamic from 'next/dynamic'

// WalletBar reads window.ethereum — must not SSR or wagmi connector state
// mismatches cause the Check button to stay disabled after connecting.
const WalletBar = dynamic(
  () => import('@/components/WalletBar').then(m => ({ default: m.WalletBar })),
  { ssr: false },
)

export default function Home() {
  const { isConnected } = useAccount()
  const [input, setInput] = useState('')
  const { phase, verdict, txHash1, txHash2, error, analyze, reset } = useVetra()

  const isValidAddress = isAddress(input.trim())
  const busy = !['idle', 'done', 'error'].includes(phase)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAddress || busy) return
    analyze(input.trim())
  }

  function handleReset() {
    reset()
    setInput('')
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#000000',
      color: '#F9FAFB',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      padding: '0 16px',
    }}>
      {/* Topbar */}
      <div style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '20px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #111827',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#19D184" strokeWidth="1.5" />
            <path d="M8 12l2.5 2.5L16 9" stroke="#19D184" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>Vetra</span>
          <span style={{
            fontSize: '10px', color: '#19D184',
            border: '1px solid rgba(25,209,132,0.3)',
            borderRadius: '4px', padding: '1px 6px',
            letterSpacing: '0.05em',
          }}>
            TESTNET
          </span>
        </div>
        <WalletBar />
      </div>

      {/* Main card */}
      <div style={{ maxWidth: '720px', margin: '48px auto 0' }}>
        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 42px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          marginBottom: '12px',
        }}>
          Crypto address<br />
          <span style={{ color: '#19D184' }}>reputation scorer</span>
        </h1>

        <p style={{ color: '#6B7280', fontSize: '15px', marginBottom: '32px', lineHeight: 1.6 }}>
          Paste any Ethereum address. An AI agent fetches on-chain history via Ritual&apos;s HTTP
          precompile, then scores it with the LLM precompile. Results are cached on-chain.
        </p>

        {/* Input form */}
        <form onSubmit={handleSubmit}>
          <div style={{
            background: '#111827',
            border: `1px solid ${input && !isValidAddress ? '#EF4444' : '#1F2937'}`,
            borderRadius: '10px',
            padding: '4px 4px 4px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <input
              value={input}
              onChange={e => { setInput(e.target.value); if (phase !== 'idle') reset() }}
              placeholder="0x... Ethereum address"
              disabled={busy}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#F9FAFB',
                fontSize: '15px',
                fontFamily: 'monospace',
                padding: '10px 0',
              }}
              spellCheck={false}
              autoComplete="off"
            />

            {phase === 'done' || phase === 'error' ? (
              <button
                type="button"
                onClick={handleReset}
                style={submitStyle('#374151')}
              >
                Reset
              </button>
            ) : (
              <button
                type="submit"
                disabled={!isValidAddress || busy || !isConnected}
                style={submitStyle(isValidAddress && isConnected && !busy ? '#19D184' : '#374151')}
              >
                {busy ? 'Analyzing…' : 'Check'}
              </button>
            )}
          </div>

          {!isConnected && (
            <p style={{ color: '#FACC15', fontSize: '12px', marginTop: '8px' }}>
              Connect your wallet to analyze addresses.
            </p>
          )}
          {input && !isValidAddress && (
            <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '8px' }}>
              Not a valid Ethereum address.
            </p>
          )}
        </form>

        {/* Phase progress */}
        <PhaseStatus phase={phase} txHash1={txHash1} txHash2={txHash2} />

        {/* Error */}
        {phase === 'error' && error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px',
            padding: '16px',
            marginTop: '20px',
          }}>
            <p style={{ color: '#EF4444', fontSize: '13px', lineHeight: 1.5 }}>
              <strong>Error:</strong> {error}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '8px' }}>
              Make sure your wallet has RITUAL deposited in RitualWallet. Use the
              &ldquo;+ Deposit Fees&rdquo; button above.
            </p>
          </div>
        )}

        {/* Verdict */}
        {verdict && phase === 'done' && (
          <VerdictCard verdict={verdict} cachedAddress={input.trim()} />
        )}

        {/* How it works */}
        {phase === 'idle' && (
          <div style={{ marginTop: '64px', borderTop: '1px solid #111827', paddingTop: '32px' }}>
            <h2 style={{ fontSize: '13px', color: '#4B5563', letterSpacing: '0.1em', marginBottom: '20px' }}>
              HOW IT WORKS
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              {[
                { n: '01', title: 'HTTP precompile', body: 'TX1 fetches ETH balance & transaction count from a public JSON-RPC endpoint — on-chain, no oracle.' },
                { n: '02', title: 'LLM precompile',  body: 'TX2 feeds the data to GLM-4.7-FP8 inside a TEE executor. The model returns a 0–100 risk score.' },
                { n: '03', title: 'Cached on-chain', body: 'Results are stored in the contract. Repeat queries for the same address are free and instant.' },
              ].map(item => (
                <div key={item.n} style={{ background: '#0A0A0A', border: '1px solid #1F2937', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ color: '#19D184', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>{item.n}</div>
                  <div style={{ color: '#F9FAFB', fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>{item.title}</div>
                  <div style={{ color: '#6B7280', fontSize: '12px', lineHeight: 1.6 }}>{item.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000; }
        input::placeholder { color: #4B5563; }
        button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>
    </main>
  )
}

function submitStyle(bg: string) {
  return {
    background: bg,
    border: 'none',
    borderRadius: '7px',
    color: bg === '#374151' ? '#9CA3AF' : '#000000',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: bg === '#374151' ? 'not-allowed' as const : 'pointer' as const,
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.15s',
  }
}
