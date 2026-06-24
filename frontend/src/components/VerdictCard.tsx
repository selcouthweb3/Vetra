'use client'

import { useState } from 'react'
import { Copy, Share2, Check, ExternalLink } from 'lucide-react'
import { type VerdictResult, scoreToVerdict, hexToEth, hexToDecimal, formatTimestamp } from '@/lib/ritual'
import type { Hex } from 'viem'

interface Props {
  verdict:       VerdictResult
  cachedAddress: string
  txHash1?:      Hex | null
  txHash2?:      Hex | null
}

const EXPLORER_TX   = 'https://explorer.ritualfoundation.org/tx'
const EXPLORER_ADDR = 'https://explorer.ritualfoundation.org/address'

type Band = { stroke: string; fill: string; label: string; bg: string; border: string; text: string }

const BANDS: Record<string, Band> = {
  safe:    { stroke: '#34d399', fill: 'rgba(52,211,153,0.08)',  label: 'Low Risk',      bg: 'bg-emerald-400/5',  border: 'border-emerald-400/20', text: 'text-emerald-400' },
  caution: { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.08)',  label: 'Moderate Risk', bg: 'bg-amber-400/5',    border: 'border-amber-400/20',   text: 'text-amber-400'   },
  danger:  { stroke: '#f87171', fill: 'rgba(248,113,113,0.08)', label: 'High Risk',     bg: 'bg-rose-400/5',     border: 'border-rose-400/20',    text: 'text-rose-400'    },
  unknown: { stroke: '#71717a', fill: 'rgba(113,113,122,0.08)', label: 'Unknown',       bg: 'bg-zinc-800/50',    border: 'border-zinc-700',       text: 'text-zinc-400'    },
}

function ScoreGauge({ score, band }: { score: number; band: Band }) {
  const SIZE  = 180
  const R     = 76
  const CX    = SIZE / 2
  const CY    = SIZE / 2
  const pct   = Math.max(0, Math.min(100, score)) / 100
  const SWEEP = 270

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto">
      <path d={describeArc(CX, CY, R, 135, 405)} fill="none" stroke="#27272a" strokeWidth="10" strokeLinecap="round" />
      {pct > 0 && (
        <path
          d={describeArc(CX, CY, R, 135, 135 + SWEEP * pct)}
          fill="none"
          stroke={band.stroke}
          strokeWidth="10"
          strokeLinecap="round"
        />
      )}
      <circle cx={CX} cy={CY} r={R - 5} fill={band.fill} />
      <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="middle"
            fill={score < 0 ? '#71717a' : band.stroke}
            fontSize="40" fontWeight="800" fontFamily="Inter Variable, Inter, sans-serif">
        {score < 0 ? '?' : score}
      </text>
      <text x={CX} y={CY + 24} textAnchor="middle" dominantBaseline="middle"
            fill="#52525b" fontSize="11" fontFamily="Inter Variable, Inter, sans-serif">
        / 100
      </text>
    </svg>
  )
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg)
  const end   = polarToCartesian(cx, cy, r, startDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function VerdictCard({ verdict, cachedAddress, txHash1, txHash2 }: Props) {
  const level = scoreToVerdict(verdict.score)
  const band  = BANDS[level]
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  const ethBalance = hexToEth(verdict.balanceHex)
  const txCount    = hexToDecimal(verdict.txCountHex)
  const scannedAt  = formatTimestamp(verdict.cachedAtTimestamp)

  function copyAddress() {
    navigator.clipboard.writeText(cachedAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function shareVerdict() {
    const text = [
      `Vetra Reputation Report`,
      `Address: ${cachedAddress}`,
      `Risk Score: ${verdict.score < 0 ? '?' : verdict.score}/100 (${band.label})`,
      verdict.reason ? `"${verdict.reason}"` : '',
      `Powered by Ritual Testnet — vetra.xyz`,
    ].filter(Boolean).join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setShared(true)
      setTimeout(() => setShared(false), 1500)
    })
  }

  return (
    <div className={`mt-6 rounded-2xl border ${band.border} ${band.bg} overflow-hidden`}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
        <div className="text-xs font-medium tracking-widest text-zinc-500">REPUTATION VERDICT</div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full border ${band.border} ${band.text}`}>
          {band.label}
        </div>
      </div>

      {/* Score gauge */}
      <div className="flex flex-col items-center py-8 px-6">
        <ScoreGauge score={verdict.score} band={band} />
        <div className={`mt-2 text-lg font-bold tracking-tight ${band.text}`}>{band.label}</div>
      </div>

      {/* AI Analysis */}
      {verdict.reason && (
        <div className="mx-6 mb-4 rounded-xl bg-zinc-900/80 border border-zinc-800 p-5">
          <div className="text-xs font-medium tracking-widest text-zinc-500 mb-3">AI ANALYSIS</div>
          <p className="text-sm leading-relaxed text-zinc-300">{verdict.reason}</p>
        </div>
      )}

      {/* Error */}
      {verdict.error && (
        <div className="mx-6 mb-4 rounded-xl bg-rose-400/5 border border-rose-400/20 p-4">
          <p className="text-xs text-rose-400">{verdict.error}</p>
        </div>
      )}

      {/* On-chain data */}
      {(verdict.balanceHex || verdict.txCountHex) && (
        <div className="mx-6 mb-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4">
          <div className="text-xs font-medium tracking-widest text-zinc-500 mb-3">ON-CHAIN DATA</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-zinc-600 mb-1">ETH BALANCE</div>
              <div className="text-sm font-mono font-semibold text-zinc-200">{ethBalance}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 mb-1">TRANSACTIONS</div>
              <div className="text-sm font-mono font-semibold text-zinc-200">
                {Number(txCount).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metadata footer */}
      <div className="px-6 pb-6 flex flex-col gap-2">

        {/* Address */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 w-20 shrink-0">Address</span>
          <a href={`${EXPLORER_ADDR}/${cachedAddress}`} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-200 truncate">
            {cachedAddress}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>

        {/* Requested by */}
        {verdict.requestedBy && verdict.requestedBy !== '0x0000000000000000000000000000000000000000' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 w-20 shrink-0">Requested by</span>
            <a href={`${EXPLORER_ADDR}/${verdict.requestedBy}`} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-200">
              {truncateAddr(verdict.requestedBy)}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}

        {/* Scan time */}
        {verdict.cachedAtTimestamp && verdict.cachedAtTimestamp > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 w-20 shrink-0">Scanned</span>
            <span className="text-xs text-zinc-500">{scannedAt}</span>
          </div>
        )}

        {/* TX hashes */}
        {txHash1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 w-20 shrink-0">TX1 (fetch)</span>
            <a href={`${EXPLORER_TX}/${txHash1}`} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-200">
              {txHash1.slice(0, 12)}…{txHash1.slice(-8)}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}
        {txHash2 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 w-20 shrink-0">TX2 (LLM)</span>
            <a href={`${EXPLORER_TX}/${txHash2}`} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-200">
              {txHash2.slice(0, 12)}…{txHash2.slice(-8)}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center gap-3">
          <button
            onClick={copyAddress}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs transition-all duration-150"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
          <button
            onClick={shareVerdict}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs transition-all duration-150"
          >
            {shared ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            {shared ? 'Copied!' : 'Share verdict'}
          </button>
        </div>

        <div className="mt-3">
          <p className="text-xs text-zinc-600 leading-relaxed">
            Vetra uses an LLM running in a TEE to analyze public on-chain data. Results are
            heuristic, not definitive. Always do your own research.
          </p>
        </div>
      </div>
    </div>
  )
}
