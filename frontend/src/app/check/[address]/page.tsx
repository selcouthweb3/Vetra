'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createPublicClient, http, isAddress } from 'viem'
import { ArrowLeft, Search } from 'lucide-react'
import { ritualChain, VETRA_ADDRESS, vetraAbi, decodeLLMOutput, type VerdictResult } from '@/lib/ritual'
import { VerdictCard } from '@/components/VerdictCard'
import { appendHistory } from '@/lib/storage'

const client = createPublicClient({
  chain: ritualChain,
  transport: http('https://rpc.ritualfoundation.org'),
})

type PageState = 'loading' | 'found' | 'not-found' | 'invalid' | 'error'

export default function CheckPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const router      = useRouter()

  const [state,   setState]   = useState<PageState>('loading')
  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [errMsg,  setErrMsg]  = useState('')

  useEffect(() => {
    if (!isAddress(address)) {
      setState('invalid')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const [rawOutput, , cachedAtTime, requestedBy, exists] = await client.readContract({
          address:      VETRA_ADDRESS,
          abi:          vetraAbi,
          functionName: 'getResult',
          args:         [address as `0x${string}`],
        })

        if (cancelled) return

        if (!exists || (rawOutput as `0x${string}`).length <= 2) {
          setState('not-found')
          return
        }

        const [balHex, txHex] = await client.readContract({
          address:      VETRA_ADDRESS,
          abi:          vetraAbi,
          functionName: 'addressData',
          args:         [address as `0x${string}`],
        })

        if (cancelled) return

        const decoded = decodeLLMOutput(rawOutput as `0x${string}`)
        appendHistory(address, { score: decoded.score, timestamp: Number(cachedAtTime as bigint) })

        setVerdict({
          ...decoded,
          requestedBy:      requestedBy as `0x${string}`,
          cachedAtTimestamp: Number(cachedAtTime as bigint),
          balanceHex:        balHex as string,
          txCountHex:        txHex as string,
        })
        setState('found')
      } catch (e) {
        if (cancelled) return
        setErrMsg(e instanceof Error ? e.message : 'Read failed')
        setState('error')
      }
    })()

    return () => { cancelled = true }
  }, [address])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Vetra</span>
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-sm text-zinc-500 font-mono truncate">{address}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-violet-400 animate-spin" />
            <p className="text-sm text-zinc-500">Loading verdict…</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-sm text-zinc-400">Invalid Ethereum address.</p>
            <button
              onClick={() => router.push('/')}
              className="px-5 py-2 rounded-lg bg-violet-400 hover:bg-violet-300 text-zinc-950 text-sm font-semibold transition-colors"
            >
              Go home
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-sm text-rose-400">{errMsg}</p>
            <button
              onClick={() => router.push('/')}
              className="px-5 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm transition-colors hover:text-zinc-200"
            >
              Go home
            </button>
          </div>
        )}

        {state === 'not-found' && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2">
              <Search className="w-9 h-9 text-zinc-700" />
            </div>
            <p className="text-zinc-400 font-medium">No verdict yet for this address</p>
            <p className="text-sm text-zinc-600 font-mono truncate max-w-xs">{address}</p>
            <button
              onClick={() => router.push(`/?address=${address}`)}
              className="mt-4 px-5 py-2 rounded-lg bg-violet-400 hover:bg-violet-300 text-zinc-950 text-sm font-semibold transition-colors"
            >
              Analyse this wallet
            </button>
          </div>
        )}

        {state === 'found' && verdict && (
          <VerdictCard
            verdict={verdict}
            cachedAddress={address}
          />
        )}
      </main>
    </div>
  )
}
