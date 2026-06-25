'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react'
import { useRegistry } from '@/hooks/useRegistry'
import { scoreToVerdict } from '@/lib/ritual'

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
        Pending
      </span>
    )
  }
  const level = scoreToVerdict(score)
  const config = {
    safe:    { bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', text: 'text-emerald-400', label: 'Low Risk' },
    caution: { bg: 'bg-amber-400/10',   border: 'border-amber-400/30',   text: 'text-amber-400',   label: 'Moderate' },
    danger:  { bg: 'bg-rose-400/10',    border: 'border-rose-400/30',    text: 'text-rose-400',    label: 'High Risk' },
    unknown: { bg: 'bg-zinc-800',       border: 'border-zinc-700',       text: 'text-zinc-400',    label: 'Unknown'  },
  }[level]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} border ${config.border}`}>
      <span className="font-bold font-mono">{score}</span>
      <span className="text-[10px] opacity-70">{config.label}</span>
    </span>
  )
}

export default function RegistryPage() {
  const router = useRouter()
  const { entries, loading, error, refresh } = useRegistry()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center font-bold text-zinc-950 text-xs">
                V
              </div>
              <div>
                <div className="font-semibold tracking-tight leading-none text-sm">Community Registry</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Last 20 analyzed addresses</div>
              </div>
            </div>
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 text-xs transition-all duration-150 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* Auto-refresh note */}
        <p className="text-xs text-zinc-600 mb-6">Auto-refreshes every 30 seconds · Reads from on-chain events</p>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <p className="text-sm text-zinc-400">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && entries.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-400/10 flex items-center justify-center mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <p className="text-zinc-500 font-medium mb-1">No addresses analyzed yet</p>
            <p className="text-sm text-zinc-600">Be the first.</p>
            <button
              onClick={() => router.push('/')}
              className="mt-6 px-5 py-2 rounded-lg bg-violet-400 hover:bg-violet-300 text-zinc-950 text-sm font-semibold transition-colors duration-150"
            >
              Analyze an address
            </button>
          </div>
        )}

        {/* Registry table */}
        {entries.length > 0 && (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-0 text-[10px] font-medium tracking-widest text-zinc-600 px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <span>ADDRESS</span>
              <span className="text-center pr-6">RISK SCORE</span>
              <span className="text-right">ACTION</span>
            </div>

            {entries.map((entry, i) => (
              <div
                key={entry.address}
                className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-zinc-900/40 ${
                  i < entries.length - 1 ? 'border-b border-zinc-800/60' : ''
                }`}
              >
                {/* Address */}
                <div className="min-w-0">
                  <a
                    href={`https://explorer.ritualfoundation.org/address/${entry.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-150 truncate block"
                  >
                    <span className="hidden sm:inline">{entry.address}</span>
                    <span className="inline sm:hidden">{entry.address.slice(0, 10)}…{entry.address.slice(-6)}</span>
                  </a>
                </div>

                {/* Score badge */}
                <div className="pr-4">
                  <ScoreBadge score={entry.score} />
                </div>

                {/* Analyse button */}
                <button
                  onClick={() => router.push(`/?address=${entry.address}`)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-violet-400/50 hover:text-violet-400 text-zinc-500 text-xs font-medium transition-all duration-150 whitespace-nowrap"
                >
                  Analyse →
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
