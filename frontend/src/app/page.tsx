'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { Globe, Cpu, Database, Search, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

import { useVetra } from '@/hooks/useVetra'
import { StatCard }    from '@/components/StatCard'
import { FeatureCard } from '@/components/FeatureCard'
import { PhaseStepper } from '@/components/PhaseStepper'
import { VerdictCard }  from '@/components/VerdictCard'
import { ErrorBanner }  from '@/components/ErrorBanner'

// WalletBar reads window.ethereum — must not SSR
const WalletBar = dynamic(
  () => import('@/components/WalletBar').then(m => ({ default: m.WalletBar })),
  { ssr: false },
)

const VETRA_CONTRACT = '0x6a51ab19c3D570139730C93ec5233184Aa8C8B2b'
const EXPLORER_ADDR  = 'https://explorer.ritualfoundation.org/address'

export default function Home() {
  const { isConnected, chainId } = useAccount()
  const [input, setInput]        = useState('')
  const { phase, verdict, txHash1, txHash2, error, analyze, reset } = useVetra()

  const isValidAddress = isAddress(input.trim())
  const busy = !['idle', 'done', 'error'].includes(phase)
  const wrongNetwork = isConnected && chainId !== 1979

  // Toast notifications triggered by phase transitions
  useEffect(() => {
    if (phase === 'tx1-pending') toast.info('Fetching on-chain data…', { id: 'tx1' })
    if (phase === 'tx1-settling') toast.dismiss('tx1')
    if (phase === 'tx2-pending') toast.info('Running AI analysis…', { id: 'tx2' })
    if (phase === 'tx2-settling') toast.dismiss('tx2')
    if (phase === 'done')  toast.success('Analysis complete', { id: 'done' })
    if (phase === 'error' && error) toast.error(error, { id: 'err', duration: 6000 })
  }, [phase, error])

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center font-bold text-zinc-950 text-sm">
              V
            </div>
            <div>
              <div className="font-semibold tracking-tight leading-none">Vetra</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Address Reputation</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Network pill */}
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-[ping_1.5s_ease-in-out_infinite] opacity-75" />
              </div>
              <span className="text-zinc-400">Ritual Testnet</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-500 font-mono">1979</span>
            </div>
            <WalletBar />
          </div>
        </div>
      </header>

      {/* ── Wrong-network banner ────────────────────────────────────────── */}
      {wrongNetwork && (
        <div className="border-b border-amber-400/20 bg-amber-400/5">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Wrong network — please switch MetaMask to <strong>Ritual Testnet (chain 1979)</strong>.
          </div>
        </div>
      )}

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulse_2s_ease-in-out_infinite]" />
          Powered by Ritual&apos;s on-chain AI
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5 leading-tight">
          Check any wallet&apos;s<br />reputation,{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
            on-chain.
          </span>
        </h1>

        <p className="text-base md:text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          An AI agent fetches on-chain history and scores it inside a TEE.
          Trustless verdicts, cached forever.
        </p>

        {/* Search input */}
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
              <input
                value={input}
                onChange={e => { setInput(e.target.value); if (phase !== 'idle') reset() }}
                placeholder="0x… Ethereum address"
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
                className={[
                  'w-full h-14 bg-zinc-900 border rounded-xl pl-11 pr-4 font-mono text-sm',
                  'placeholder:text-zinc-600 text-zinc-100',
                  'transition-all duration-200 outline-none',
                  'focus:ring-2 focus:ring-emerald-400/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  input && !isValidAddress
                    ? 'border-rose-400/50 focus:border-rose-400/70'
                    : isValidAddress
                      ? 'border-emerald-400/40 focus:border-emerald-400/60'
                      : 'border-zinc-800 focus:border-zinc-700',
                ].join(' ')}
              />
            </div>

            {phase === 'done' || phase === 'error' ? (
              <button type="button" onClick={handleReset}
                className="h-14 px-8 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition-all duration-200 whitespace-nowrap">
                New Search
              </button>
            ) : (
              <button type="submit"
                disabled={!isValidAddress || busy || !isConnected || wrongNetwork}
                className="h-14 px-8 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed">
                {busy ? 'Analyzing…' : 'Analyze'}
              </button>
            )}
          </div>

          {/* Helper messages */}
          {!isConnected && (
            <p className="mt-3 text-xs text-zinc-500">Connect your wallet to analyze addresses.</p>
          )}
          {input && !isValidAddress && (
            <p className="mt-3 text-xs text-rose-400">Not a valid Ethereum address.</p>
          )}
        </form>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="ADDRESSES ANALYZED" value="1,247" sub="all time" />
          <StatCard label="AVG RISK SCORE"      value="34"    sub="0 = safe, 100 = risk" />
          <StatCard label="CACHE HIT RATE"      value="68%"   sub="instant results" />
          <StatCard label="ACTIVE TEES"         value="2"     sub="Ritual testnet" />
        </div>
      </section>

      {/* ── Result area ────────────────────────────────────────────────── */}
      {phase !== 'idle' && (
        <section className="max-w-2xl mx-auto px-6 pb-12">
          <PhaseStepper phase={phase} txHash1={txHash1} txHash2={txHash2} />
          {phase === 'error' && error && (
            <ErrorBanner error={error} onDismiss={handleReset} />
          )}
          {verdict && phase === 'done' && (
            <VerdictCard
              verdict={verdict}
              cachedAddress={input.trim()}
              txHash1={txHash1}
              txHash2={txHash2}
            />
          )}
        </section>
      )}

      {/* ── How it works ───────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-zinc-800/60">
          <div className="text-center mb-12">
            <div className="text-xs font-medium tracking-widest text-emerald-400 mb-3">HOW IT WORKS</div>
            <h2 className="text-3xl font-bold tracking-tight">
              Three on-chain steps. Zero infrastructure.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Globe className="w-5 h-5" />}
              step="01"
              title="HTTP precompile"
              body="Ritual's HTTP precompile fetches balance and tx history from a public JSON-RPC. No oracle, no API key, fully on-chain."
            />
            <FeatureCard
              icon={<Cpu className="w-5 h-5" />}
              step="02"
              title="LLM precompile"
              body="GLM-4.7-FP8 inside a TEE executor scores the on-chain data on a 0–100 risk scale. Verifiable, tamper-proof."
            />
            <FeatureCard
              icon={<Database className="w-5 h-5" />}
              step="03"
              title="On-chain cache"
              body="Verdicts are stored in the smart contract. Repeat queries for the same address are instant and completely free."
            />
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <span>Built on Ritual</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <a href="https://github.com/selcouthweb3/Vetra"
               target="_blank" rel="noopener noreferrer"
               className="hover:text-zinc-400 transition-colors duration-200">
              GitHub
            </a>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <a href={`${EXPLORER_ADDR}/${VETRA_CONTRACT}`}
               target="_blank" rel="noopener noreferrer"
               className="font-mono hover:text-zinc-400 transition-colors duration-200">
              {VETRA_CONTRACT.slice(0, 6)}…{VETRA_CONTRACT.slice(-4)}
            </a>
          </div>
          <div>© 2026 Vetra · Testnet</div>
        </div>
      </footer>
    </div>
  )
}
