'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { Globe, Cpu, Database, Search, AlertCircle, Clock, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

import { useVetra } from '@/hooks/useVetra'
import { StatCard }    from '@/components/StatCard'
import { FeatureCard } from '@/components/FeatureCard'
import { PhaseStepper } from '@/components/PhaseStepper'
import { VerdictCard }  from '@/components/VerdictCard'
import { ErrorBanner }  from '@/components/ErrorBanner'

const WalletBar = dynamic(
  () => import('@/components/WalletBar').then(m => ({ default: m.WalletBar })),
  { ssr: false },
)

const VETRA_CONTRACT = '0x458Ee9DeF261013fc7cF8bE3baC3e1E71669DE69'
const EXPLORER_ADDR  = 'https://explorer.ritualfoundation.org/address'

const EXAMPLES = [
  { label: 'Vitalik',  address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  { label: 'Binance',  address: '0x28C6c06298d514Db089934071355E5743bf21d60' },
  { label: 'Scammer',  address: '0x098B716B8Aaf21512996dC57EB0615e2383E2f96' },
] as const

export default function Home() {
  const { isConnected, chainId } = useAccount()
  const [input, setInput]        = useState('')
  const { phase, verdict, txHash1, txHash2, error, analyze, reset } = useVetra()

  const isValidAddress = isAddress(input.trim())
  const busy        = !['idle', 'done', 'error'].includes(phase)
  const wrongNetwork = isConnected && chainId !== 1979
  const isTimeout   = !!error && error.includes('Timeout waiting for')

  useEffect(() => {
    if (phase === 'tx1-pending') toast.info('Fetching on-chain data…', { id: 'tx1' })
    if (phase === 'tx1-settling') toast.dismiss('tx1')
    if (phase === 'tx2-pending') toast.info('Running AI analysis…', { id: 'tx2' })
    if (phase === 'tx2-settling') toast.dismiss('tx2')
    if (phase === 'done')  toast.success('Analysis complete', { id: 'done' })
    if (phase === 'error' && error && !isTimeout) toast.error(error, { id: 'err', duration: 6000 })
  }, [phase, error, isTimeout])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAddress || busy) return
    analyze(input.trim())
  }

  function handleReset() {
    reset()
    setInput('')
  }

  function handleRetry() {
    const addr = input.trim()
    reset()
    analyze(addr)
  }

  function fillExample(address: string) {
    setInput(address)
    if (phase !== 'idle') reset()
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center font-bold text-zinc-950 text-sm">
              V
            </div>
            <div>
              <div className="font-semibold tracking-tight leading-none">Vetra</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Address Reputation</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className="relative">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-violet-400 animate-[ping_1.5s_ease-in-out_infinite] opacity-60" />
              </div>
              <span className="text-zinc-500">Ritual Testnet</span>
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

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5 leading-tight">
          Check any wallet&apos;s<br />reputation,{' '}
          <span className="bg-gradient-to-r from-violet-300 to-violet-100 bg-clip-text text-transparent">
            on-chain.
          </span>
        </h1>

        <p className="text-base md:text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Get an instant AI-generated reputation verdict for any wallet — risk score, behavioral
          signals, and explanation. All powered by Ritual&apos;s on-chain HTTP and LLM precompiles.
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
                  'focus:ring-2 focus:ring-violet-400/30',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  input && !isValidAddress
                    ? 'border-rose-400/50 focus:border-rose-400/70'
                    : isValidAddress
                      ? 'border-violet-400/40 focus:border-violet-400/60'
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
                className="h-14 px-8 rounded-xl bg-violet-400 hover:bg-violet-300 text-zinc-950 text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed">
                {busy ? 'Analyzing…' : 'Analyze'}
              </button>
            )}
          </div>

          {/* Example addresses */}
          {phase === 'idle' && (
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-600">Try:</span>
              {EXAMPLES.map(({ label, address }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => fillExample(address)}
                  className="px-3 py-1.5 text-xs rounded-full border border-zinc-800 hover:border-zinc-600 text-zinc-500 hover:text-zinc-300 transition-all duration-150"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Connect wallet prompt */}
          {!isConnected && phase === 'idle' && (
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <Wallet className="w-4 h-4 text-zinc-600" />
              Connect a wallet to begin
            </div>
          )}

          {input && !isValidAddress && (
            <p className="mt-3 text-xs text-rose-400">Not a valid Ethereum address.</p>
          )}
        </form>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="ADDRESSES ANALYZED" value="47"  sub="all time" />
          <StatCard label="AVG RISK SCORE"      value="31"  sub="0 = safe, 100 = risk" />
          <StatCard label="CACHE HIT RATE"      value="23%" sub="instant results" />
          <StatCard label="ACTIVE TEES"         value="2"   sub="Ritual testnet" />
        </div>
      </section>

      {/* ── Result area ────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 pb-12">
        {phase === 'idle' ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-violet-400/10 flex items-center justify-center mb-4">
              <Search className="w-9 h-9 text-violet-400/40" />
            </div>
            <p className="text-sm text-zinc-600">Enter an address above to get started</p>
          </div>
        ) : (
          <>
            <PhaseStepper phase={phase} txHash1={txHash1} txHash2={txHash2} />

            {phase === 'error' && error && (
              isTimeout ? (
                <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-6">
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div className="flex-1">
                      <div className="font-semibold text-amber-300 mb-2">Analysis pending</div>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        The Ritual TEE executor is processing your request. Results typically appear
                        within 1–2 minutes. If this persists, the external data provider may be
                        temporarily unavailable. Try again shortly.
                      </p>
                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={handleRetry}
                          className="px-5 py-2 rounded-lg bg-violet-400 hover:bg-violet-300 text-zinc-950 text-sm font-semibold transition-colors duration-150"
                        >
                          Retry
                        </button>
                        <button
                          onClick={handleReset}
                          className="px-5 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors duration-150"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <ErrorBanner error={error} onDismiss={handleReset} />
              )
            )}

            {verdict && phase === 'done' && (
              <VerdictCard
                verdict={verdict}
                cachedAddress={input.trim()}
                txHash1={txHash1}
                txHash2={txHash2}
              />
            )}
          </>
        )}
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-zinc-800/60">
          <div className="text-center mb-12">
            <div className="text-xs font-medium tracking-widest text-violet-400 mb-3">HOW IT WORKS</div>
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
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">

            {/* Left: logo + tagline */}
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center font-bold text-zinc-950 text-[10px]">
                V
              </div>
              <span className="text-sm font-semibold text-zinc-300">Vetra</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">Built on Ritual</span>
            </div>

            {/* Center: disclaimer */}
            <p className="text-xs text-zinc-600 text-center max-w-sm">
              Demo on Ritual Testnet. Verdicts are AI-generated and not financial advice.
            </p>

            {/* Right: links */}
            <div className="flex items-center gap-5 text-xs text-zinc-500">
              <a href="https://github.com/selcouthweb3/Vetra" target="_blank" rel="noopener noreferrer"
                className="hover:text-zinc-300 transition-colors duration-150">GitHub</a>
              <a href="#" className="hover:text-zinc-300 transition-colors duration-150">Twitter</a>
              <a href="#" className="hover:text-zinc-300 transition-colors duration-150">Discord</a>
              <a href={`${EXPLORER_ADDR}/${VETRA_CONTRACT}`} target="_blank" rel="noopener noreferrer"
                className="font-mono hover:text-zinc-300 transition-colors duration-150">
                {VETRA_CONTRACT.slice(0, 6)}…{VETRA_CONTRACT.slice(-4)}
              </a>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-zinc-800/50 text-center">
            <span className="text-xs text-zinc-700">
              Powered by Ritual&apos;s on-chain HTTP and LLM precompiles
            </span>
          </div>
        </div>
      </footer>

    </div>
  )
}
