'use client'

import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  step: string
  title: string
  body: string
}

export function FeatureCard({ icon, step, title, body }: Props) {
  return (
    <div className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/80">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400 transition-colors duration-200 group-hover:bg-emerald-400/20">
          {icon}
        </div>
        <span className="font-mono text-xs font-bold text-zinc-600">{step}</span>
      </div>
      <div className="mb-2 font-semibold tracking-tight text-zinc-100">{title}</div>
      <div className="text-sm leading-relaxed text-zinc-400">{body}</div>
    </div>
  )
}
