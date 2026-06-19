'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  error: string
  onDismiss?: () => void
}

export function ErrorBanner({ error, onDismiss }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-rose-400 text-sm mb-1">Transaction failed</div>
          <div className="text-sm text-zinc-400 leading-relaxed break-words">{error}</div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors duration-200 border border-zinc-700 rounded-lg px-3 py-1.5"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
