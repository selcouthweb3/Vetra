'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http } from 'viem'
import { ritualChain, VETRA_ADDRESS, vetraAbi, decodeLLMOutput, type VerdictResult } from '@/lib/ritual'

export interface RegistryEntry {
  address:     string
  score:       number | null  // null = not yet cached
  verdict:     VerdictResult | null
  blockNumber: bigint
}

const client = createPublicClient({
  chain: ritualChain,
  transport: http('https://rpc.ritualfoundation.org'),
})

const REPUTATION_ANALYZED_EVENT = {
  type:   'event',
  name:   'ReputationAnalyzed',
  inputs: [
    { name: 'target',      type: 'address', indexed: true  },
    { name: 'blockNumber', type: 'uint256', indexed: false },
    { name: 'requestedBy', type: 'address', indexed: true  },
  ],
} as const

export function useRegistry() {
  const [entries,  setEntries]  = useState<RegistryEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (VETRA_ADDRESS === '0x0') {
      setLoading(false)
      return
    }
    try {
      const currentBlock = await client.getBlockNumber()
      // Scan last ~100k blocks (~3 days on Ritual testnet)
      const fromBlock = currentBlock > 100_000n ? currentBlock - 100_000n : 0n

      const logs = await client.getLogs({
        address:   VETRA_ADDRESS,
        event:     REPUTATION_ANALYZED_EVENT,
        fromBlock,
        toBlock:   currentBlock,
      })

      // Deduplicate by address, keep latest per address, then take last 20
      const seen   = new Map<string, (typeof logs)[number]>()
      for (const log of logs) {
        const addr = (log.args.target as string).toLowerCase()
        seen.set(addr, log)
      }

      const deduped = [...seen.values()]
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, 20)

      // Batch getResult reads
      const results = await Promise.all(
        deduped.map(async log => {
          const addr = log.args.target as string
          try {
            const [rawOutput, , , , exists] = await client.readContract({
              address:      VETRA_ADDRESS,
              abi:          vetraAbi,
              functionName: 'getResult',
              args:         [addr as `0x${string}`],
            })
            if (!exists) {
              return { address: addr, score: null, verdict: null, blockNumber: log.blockNumber ?? 0n }
            }
            const verdict = decodeLLMOutput(rawOutput as `0x${string}`)
            return { address: addr, score: verdict.score, verdict, blockNumber: log.blockNumber ?? 0n }
          } catch {
            return { address: addr, score: null, verdict: null, blockNumber: log.blockNumber ?? 0n }
          }
        })
      )

      setEntries(results)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load registry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    intervalRef.current = setInterval(fetch, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetch])

  return { entries, loading, error, refresh: fetch }
}
