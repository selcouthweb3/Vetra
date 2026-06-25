'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { loadHistory, type ScoreEntry } from '@/lib/storage'

interface Props {
  address: string
}

function shortDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ScoreEntry & { label: string }
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg">
      <div className="text-zinc-400 mb-1">{d.label}</div>
      <div className="font-semibold text-violet-300">Score: {d.score}/100</div>
    </div>
  )
}

export function ScoreHistory({ address }: Props) {
  const [history, setHistory] = useState<ScoreEntry[]>([])

  useEffect(() => {
    setHistory(loadHistory(address))
  }, [address])

  if (history.length === 0) return null

  if (history.length === 1) {
    return (
      <div className="mx-6 mb-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4">
        <div className="text-xs font-medium tracking-widest text-zinc-500 mb-2">SCORE HISTORY</div>
        <p className="text-xs text-zinc-600">First analysis — no history yet.</p>
      </div>
    )
  }

  const data = history.map(e => ({ ...e, label: shortDate(e.timestamp) }))

  return (
    <div className="mx-6 mb-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4">
      <div className="text-xs font-medium tracking-widest text-zinc-500 mb-4">SCORE HISTORY</div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#52525b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#52525b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            ticks={[0, 33, 67, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={33} stroke="#27272a" strokeDasharray="3 3" />
          <ReferenceLine y={67} stroke="#27272a" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#2dd4bf"
            strokeWidth={2}
            dot={{ r: 3, fill: '#2dd4bf', strokeWidth: 0 }}
            activeDot={{ r: 4, fill: '#2dd4bf' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
