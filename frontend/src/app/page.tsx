'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useAccount } from 'wagmi'
import { isAddress, createPublicClient, http } from 'viem'
import { Globe, Cpu, Database, Search, AlertCircle, Clock, Wallet, ChevronRight, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { useVetra } from '@/hooks/useVetra'
import { useRegistry } from '@/hooks/useRegistry'
import { StatCard }     from '@/components/StatCard'
import { FeatureCard }  from '@/components/FeatureCard'
import { PhaseStepper } from '@/components/PhaseStepper'
import { VerdictCard }  from '@/components/VerdictCard'
import { ErrorBanner }  from '@/components/ErrorBanner'
import { VETRA_ADDRESS, vetraAbi, ritualChain, scoreToVerdict, type VerdictResult } from '@/lib/ritual'

const WalletBar = dynamic(
  () => import('@/components/WalletBar').then(m => ({ default: m.WalletBar })),
  { ssr: false },
)

const EXPLORER_ADDR = 'https://explorer.ritualfoundation.org/address'

const EXAMPLES = [
  { label: 'Vitalik',  address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  { label: 'Binance',  address: '0x28C6c06298d514Db089934071355E5743bf21d60' },
  { label: 'Scammer',  address: '0x098B716B8Aaf21512996dC57EB0615e2383E2f96' },
] as const

const DEMO_ADDRESS = '0xdEAD000000000000000042069420694206942069'
const DEMO_VERDICT: VerdictResult = {
  score:  42,
  reason: 'Moderate activity with mixed signals. This wallet has interacted with several DeFi protocols and shows a typical active-user pattern, but a handful of transactions touch contracts flagged for suspicious behavior. No definitive evidence of malicious intent — exercise caution before transacting.',
  balanceHex: '0x16345785D8A0000',
  txCountHex: '0x4d',
}

// Standalone client for stats reads (no wallet connection required)
const statsClient = createPublicClient({
  chain: ritualChain,
  transport: http('https://rpc.ritualfoundation.org'),
})

const RISK_BADGE: Record<string, string> = {
  safe:    'bg-emerald-400/10 text-emerald-400 border-emerald-400/30',
  caution: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
  danger:  'bg-rose-400/10 text-rose-400 border-rose-400/30',
  unknown: 'bg-zinc-800 text-zinc-500 border-zinc-700',
}

function HomeInner() {
  const { isConnected, chainId, address: connectedWallet } = useAccount()
  const [input, setInput]       = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const { phase, verdict, txHash1, txHash2, error, analyze, reset } = useVetra()
  const { entries: registryEntries, loading: registryLoading } = useRegistry()
  const searchParams = useSearchParams()
  const didPrefill   = useRef(false)

  const previewEntries = registryEntries.slice(0, 3)

  // Pre-fill input from ?address= query param (used by Registry "Analyse →" button)
  useEffect(() => {
    if (didPrefill.current) return
    const addr = searchParams?.get('address')
    if (addr && isAddress(addr)) {
      setInput(addr)
      didPrefill.current = true
    }
  }, [searchParams])

  const [totalAnalyzed, setTotalAnalyzed] = useState<string>('—')

  useEffect(() => {
    if (VETRA_ADDRESS === '0x0') return
    statsClient.readContract({
      address: VETRA_ADDRESS,
      abi: vetraAbi,
      functionName: 'totalAnalyzed',
    }).then(n => setTotalAnalyzed(String(n))).catch(() => {})
  }, [])

  const isValidAddress = isAddress(input.trim())
  const busy           = !['idle', 'done', 'error'].includes(phase)
  const wrongNetwork   = isConnected && chainId !== 1979
  const isTimeout      = !!error && error.includes('Timeout waiting for')

  useEffect(() => {
    if (phase === 'tx1-pending')  toast.info('Fetching on-chain data…', { id: 'tx1' })
    if (phase === 'tx1-settling') toast.dismiss('tx1')
    if (phase === 'tx2-pending')  toast.info('Running AI analysis…', { id: 'tx2' })
    if (phase === 'tx2-settling') toast.dismiss('tx2')
    if (phase === 'done')  toast.success('Analysis complete', { id: 'done' })
    if (phase === 'error' && error && !isTimeout) toast.error(error, { id: 'err', duration: 6000 })
  }, [phase, error, isTimeout])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAddress || busy) return
    setDemoMode(false)
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
              <div className="text-[10px] text-zinc-500 mt-0.5">Address Reputation · V2</div>
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
            <Link
              href="/registry"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors duration-150 border border-teal-400/40 hover:border-teal-400/70 bg-teal-400/5 hover:bg-teal-400/10 rounded-lg px-3 py-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
              Registry
            </Link>
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
                onChange={e => {
                  setInput(e.target.value)
                  if (!['idle', 'done', 'error'].includes(phase)) reset()
                }}
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

          {/* Example addresses + Demo Mode toggle */}
          {phase === 'idle' && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-2 flex-wrap">
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

              <button
                type="button"
                onClick={() => setDemoMode(d => !d)}
                className={[
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
                  demoMode
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-400 hover:bg-amber-400/15'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500',
                ].join(' ')}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                {demoMode ? 'Demo Mode ON — click to disable' : 'Try Demo Mode (no wallet needed)'}
              </button>
            </div>
          )}

          {/* Connect wallet prompt */}
          {!isConnected && phase === 'idle' && !demoMode && (
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
      <section className="max-w-7xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="ADDRESSES SCANNED" value={totalAnalyzed} sub="on Ritual Testnet" />
          <StatCard label="ON-CHAIN CACHE"     value="∞"            sub="no expiry by default" />
          <StatCard label="NETWORK"            value="Ritual"       sub="Chain 1979 — Testnet" />
          <StatCard label="AI MODEL"           value="GLM-4.7"      sub="FP8 in TEE executor" />
        </div>
      </section>

      {/* ── Community Registry preview ──────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
            <div>
              <div className="text-xs font-medium tracking-widest text-zinc-500 mb-0.5">COMMUNITY REGISTRY</div>
              <div className="text-sm font-semibold text-zinc-200">Recently analyzed addresses</div>
            </div>
            <Link
              href="/registry"
              className="flex items-center gap-1 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors duration-150"
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Loading skeleton */}
          {registryLoading && previewEntries.length === 0 && (
            <div className="px-5 py-4 space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 rounded-lg bg-zinc-800/50 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!registryLoading && previewEntries.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-zinc-600">No addresses analyzed yet — be the first.</p>
            </div>
          )}

          {/* Entries */}
          {previewEntries.map((entry, i) => {
            const level = entry.score !== null ? scoreToVerdict(entry.score) : 'unknown'
            return (
              <div
                key={entry.address}
                className={`flex items-center justify-between px-5 py-3.5 hover:bg-zinc-900/60 transition-colors duration-150 ${
                  i < previewEntries.length - 1 ? 'border-b border-zinc-800/60' : ''
                }`}
              >
                <a
                  href={`${EXPLORER_ADDR}/${entry.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-150 truncate flex-1 mr-4"
                >
                  <span className="hidden sm:inline">{entry.address}</span>
                  <span className="inline sm:hidden">{entry.address.slice(0, 10)}…{entry.address.slice(-6)}</span>
                </a>
                {entry.score !== null ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${RISK_BADGE[level]}`}>
                    <span className="font-bold font-mono">{entry.score}</span>
                    <span className="opacity-70 text-[10px]">/ 100</span>
                  </span>
                ) : (
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs border shrink-0 ${RISK_BADGE.unknown}`}>
                    Pending
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Result area ────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 pb-12">
        {demoMode ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/5 text-amber-300 text-xs font-medium mb-4">
              <FlaskConical className="w-3.5 h-3.5 shrink-0" />
              Demo Mode — not a real on-chain result
            </div>
            <VerdictCard
              verdict={DEMO_VERDICT}
              cachedAddress={DEMO_ADDRESS}
              connectedWallet={connectedWallet}
            />
          </>
        ) : phase === 'idle' ? (
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
                connectedWallet={connectedWallet}
                txHash1={txHash1}
                txHash2={txHash2}
              />
            )}
          </>
        )}
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      {(phase === 'idle' || demoMode) && (
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

            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center font-bold text-zinc-950 text-[10px]">
                V
              </div>
              <span className="text-sm font-semibold text-zinc-300">Vetra</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">Built on Ritual</span>
            </div>

            <p className="text-xs text-zinc-600 text-center max-w-sm">
              Demo on Ritual Testnet. Verdicts are AI-generated and not financial advice.
            </p>

            <div className="flex items-center gap-5 text-xs text-zinc-500">
              <a href="https://github.com/selcouthweb3/Vetra" target="_blank" rel="noopener noreferrer"
                className="hover:text-zinc-300 transition-colors duration-150">GitHub</a>
              <a href="#" className="hover:text-zinc-300 transition-colors duration-150">Twitter</a>
              <a href="#" className="hover:text-zinc-300 transition-colors duration-150">Discord</a>
              <a href={`${EXPLORER_ADDR}/${VETRA_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                className="font-mono hover:text-zinc-300 transition-colors duration-150">
                {VETRA_ADDRESS.slice(0, 6)}…{VETRA_ADDRESS.slice(-4)}
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

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  )
}
