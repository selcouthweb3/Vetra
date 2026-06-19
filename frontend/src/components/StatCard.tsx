'use client'

interface Props {
  label: string
  value: string
  sub?: string
}

export function StatCard({ label, value, sub }: Props) {
  return (
    <div className="group relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900">
      <div className="text-xs font-medium tracking-widest text-zinc-500 mb-2">{label}</div>
      <div className="text-2xl font-bold tracking-tight text-zinc-100">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}
