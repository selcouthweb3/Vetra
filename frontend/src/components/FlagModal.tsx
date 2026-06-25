'use client'

import { useState, useEffect, useRef } from 'react'
import { Flag, X, ChevronDown, ChevronUp } from 'lucide-react'
import { loadFlags, appendFlag, type Flag as FlagData } from '@/lib/storage'

interface Props {
  address:  string
  flagger?: string  // connected wallet address, or undefined if not connected
}

function formatRelative(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function FlagSection({ address, flagger }: Props) {
  const [flags, setFlags]         = useState<FlagData[]>([])
  const [open, setOpen]           = useState(false)
  const [reason, setReason]       = useState('')
  const [expanded, setExpanded]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setFlags(loadFlags(address))
  }, [address])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  function handleSubmit() {
    if (!reason.trim()) return
    const flag: FlagData = {
      flagger:   flagger ?? 'anon',
      reason:    reason.trim().slice(0, 200),
      timestamp: Math.floor(Date.now() / 1000),
    }
    const next = appendFlag(address, flag)
    setFlags(next)
    setReason('')
    setOpen(false)
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800/60">

      {/* Trigger row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 transition-colors duration-150"
        >
          <Flag className="w-3.5 h-3.5" />
          {submitted ? (
            <span className="text-rose-400">Flag submitted</span>
          ) : (
            'Flag this address'
          )}
        </button>

        {flags.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-150"
          >
            {flags.length} community flag{flags.length !== 1 ? 's' : ''}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Flag input */}
      {open && (
        <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-rose-400">Report suspicious activity</span>
            <button
              onClick={() => { setOpen(false); setReason('') }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            ref={inputRef}
            value={reason}
            onChange={e => setReason(e.target.value.slice(0, 200))}
            placeholder="Describe why this address is suspicious… (max 200 chars)"
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none focus:border-rose-400/50 transition-colors duration-150"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-zinc-600">{reason.length}/200</span>
            <button
              disabled={!reason.trim()}
              onClick={handleSubmit}
              className="px-4 py-1.5 rounded-lg bg-rose-400/90 hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 text-xs font-semibold transition-colors duration-150"
            >
              Submit flag
            </button>
          </div>
        </div>
      )}

      {/* Existing flags */}
      {expanded && flags.length > 0 && (
        <div className="mt-3 space-y-2">
          {flags.map((f, i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-zinc-500">
                  {f.flagger === 'anon' ? 'anon' : `${f.flagger.slice(0, 6)}…${f.flagger.slice(-4)}`}
                </span>
                <span className="text-[10px] text-zinc-600">{formatRelative(f.timestamp)}</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{f.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
