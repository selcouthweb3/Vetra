'use client'

import { useState, useCallback, useRef } from 'react'
import { usePublicClient, useWalletClient, useAccount } from 'wagmi'
import { createPublicClient, encodeFunctionData, http, isAddress, parseEventLogs } from 'viem'
import type { Hex, Address, PublicClient } from 'viem'
import {
  VETRA_ADDRESS,
  vetraAbi,
  TEE_REGISTRY,
  teeRegistryAbi,
  ritualChain,
  decodeLLMOutput,
  type VerdictResult,
} from '@/lib/ritual'

// Account-free public client for all read-only calls.
// wagmi's usePublicClient may include the connected account in eth_call 'from'
// fields, which causes some Ritual RPC nodes to return 0x for view calls.
const rawClient = createPublicClient({
  chain: ritualChain,
  transport: http('https://rpc.ritualfoundation.org'),
})

// ── Types ────────────────────────────────────────────────────────────────────

export type Phase =
  | 'idle'
  | 'checking-cache'
  | 'fetching-executor'
  | 'tx1-pending'
  | 'tx1-settling'
  | 'tx2-pending'
  | 'tx2-settling'
  | 'done'
  | 'error'

export interface UseVetraReturn {
  phase:   Phase
  verdict: VerdictResult | null
  txHash1: Hex | null
  txHash2: Hex | null
  error:   string | null
  analyze: (target: string) => Promise<void>
  reset:   () => void
}

const TTL = 300n

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVetra(): UseVetraReturn {
  const { address: account } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // walletClient resolves slightly after account on connect — a ref always holds
  // the latest value without causing analyze() to re-create on each connect tick.
  const walletClientRef = useRef(walletClient)
  walletClientRef.current = walletClient

  const [phase,   setPhase]   = useState<Phase>('idle')
  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [txHash1, setTxHash1] = useState<Hex | null>(null)
  const [txHash2, setTxHash2] = useState<Hex | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  // abortRef cancels any in-flight analyze() when reset() is called.
  // It is set back to false only at the START of a new analyze() call —
  // no setTimeout, which previously caused a race where RPC responses
  // arriving in the 50ms window would silently abort the new run.
  const abortRef = useRef(false)

  const reset = useCallback(() => {
    abortRef.current = true
    setPhase('idle')
    setVerdict(null)
    setTxHash1(null)
    setTxHash2(null)
    setError(null)
  }, [])

  const analyze = useCallback(async (targetRaw: string) => {
    const wc = walletClientRef.current

    if (!publicClient || !wc || !account) {
      setError('Connect your wallet first')
      setPhase('error')
      return
    }

    if (!isAddress(targetRaw)) {
      setError('Invalid Ethereum address')
      setPhase('error')
      return
    }
    const target = targetRaw as Address

    // Clear abort flag for this new run before any await
    abortRef.current = false
    setPhase('checking-cache')
    setVerdict(null)
    setTxHash1(null)
    setTxHash2(null)
    setError(null)

    try {
      // 1. Check cache
      let cacheHit = false
      try {
        const [rawOutput, , cachedAtTime, requestedBy, exists] = await rawClient.readContract({
          address: VETRA_ADDRESS,
          abi: vetraAbi,
          functionName: 'getResult',
          args: [target],
        })
        if (exists && (rawOutput as Hex).length > 2) {
          const [balHex, txHex] = await rawClient.readContract({
            address: VETRA_ADDRESS,
            abi: vetraAbi,
            functionName: 'addressData',
            args: [target],
          })
          setVerdict({
            ...decodeLLMOutput(rawOutput as Hex),
            requestedBy:      requestedBy as Address,
            cachedAtTimestamp: Number(cachedAtTime as bigint),
            balanceHex:        balHex as string,
            txCountHex:        txHex as string,
          })
          setPhase('done')
          cacheHit = true
        }
      } catch {
        // cache miss — fall through to TX flow
      }
      if (cacheHit) return

      // 2. Pick executors
      setPhase('fetching-executor')

      if (publicClient.chain?.id !== 1979) {
        throw new Error(
          `Wrong network — please switch MetaMask to Ritual Testnet (chain 1979). Currently on chain ${publicClient.chain?.id}.`
        )
      }

      let executor: Address
      let llmExecutor: Address
      try {
        const [httpAddr, httpFound] = await rawClient.readContract({
          address: TEE_REGISTRY,
          abi: teeRegistryAbi,
          functionName: 'pickServiceByCapability',
          args: [0, true, BigInt(Date.now()), 5n] as const,
        })
        if (!httpFound) throw new Error('no-service')
        executor = httpAddr as Address

        const [llmAddr, llmFound] = await rawClient.readContract({
          address: TEE_REGISTRY,
          abi: teeRegistryAbi,
          functionName: 'pickServiceByCapability',
          args: [1, true, BigInt(Date.now() + 1), 5n] as const,
        })
        if (!llmFound) throw new Error('no-service')
        llmExecutor = llmAddr as Address
      } catch (registryErr) {
        const raw = registryErr instanceof Error ? registryErr.message : String(registryErr)
        if (raw === 'no-service') {
          throw new Error('No Ritual precompile service registered for this capability — try again later')
        }
        throw new Error(`Ritual registry call failed: ${raw}`)
      }

      if (abortRef.current) return

      // 3. TX1: fetchData — HTTP precompile
      // Must use sendTransaction + encodeFunctionData (NOT writeContractAsync)
      // because async precompile fulfilled replay breaks with writeContractAsync.
      setPhase('tx1-pending')
      const data1 = encodeFunctionData({
        abi: vetraAbi,
        functionName: 'fetchData',
        args: [target, executor as Address, TTL],
      })

      let hash1: Hex
      try {
        hash1 = await wc.sendTransaction({
          to: VETRA_ADDRESS,
          data: data1,
          gas: 800_000n,
        })
      } catch (txErr) {
        console.error('[useVetra] TX1 sendTransaction failed', txErr)
        throw txErr
      }
      setTxHash1(hash1)

      setPhase('tx1-settling')
      await waitForEvent(rawClient, hash1, target, 'DataFetched')

      if (abortRef.current) return

      // 4. TX2: analyzeReputation — LLM precompile
      setPhase('tx2-pending')
      const data2 = encodeFunctionData({
        abi: vetraAbi,
        functionName: 'analyzeReputation',
        args: [target, llmExecutor as Address, TTL],
      })

      const hash2 = await wc.sendTransaction({
        to: VETRA_ADDRESS,
        data: data2,
        gas: 1_500_000n,
      })
      setTxHash2(hash2)

      setPhase('tx2-settling')
      await waitForEvent(rawClient, hash2, target, 'ReputationAnalyzed')

      if (abortRef.current) return

      // 5. Read result + address data in parallel
      const [[finalOutput, , cachedAtTime, requestedBy], [balHex, txHex]] = await Promise.all([
        rawClient.readContract({
          address: VETRA_ADDRESS,
          abi: vetraAbi,
          functionName: 'getResult',
          args: [target],
        }),
        rawClient.readContract({
          address: VETRA_ADDRESS,
          abi: vetraAbi,
          functionName: 'addressData',
          args: [target],
        }),
      ])

      setVerdict({
        ...decodeLLMOutput(finalOutput as Hex),
        requestedBy:      requestedBy as Address,
        cachedAtTimestamp: Number(cachedAtTime as bigint),
        balanceHex:        balHex as string,
        txCountHex:        txHex as string,
      })
      setPhase('done')
    } catch (e: unknown) {
      if (abortRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase('error')
    }
  }, [publicClient, account])

  return { phase, verdict, txHash1, txHash2, error, analyze, reset }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DATA_FETCHED_EVENT = {
  type:   'event',
  name:   'DataFetched',
  inputs: [
    { name: 'target',     type: 'address', indexed: true  },
    { name: 'balanceHex', type: 'string',  indexed: false },
    { name: 'txCountHex', type: 'string',  indexed: false },
  ],
} as const

const REPUTATION_ANALYZED_EVENT = {
  type:   'event',
  name:   'ReputationAnalyzed',
  inputs: [
    { name: 'target',      type: 'address', indexed: true  },
    { name: 'blockNumber', type: 'uint256', indexed: false },
    { name: 'requestedBy', type: 'address', indexed: true  },
  ],
} as const

// Checks receipt logs first (fast path), then polls for the fulfilled-replay TX.
// The commitment TX receipt has empty logs; the event fires when the Ritual executor
// settles the precompile call in a separate fulfilled-replay TX.
async function waitForEvent(
  client: PublicClient,
  txHash: Hex,
  target: Address,
  eventName: 'DataFetched' | 'ReputationAnalyzed',
): Promise<void> {
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    timeout: 60_000,
  })

  const parsed = parseEventLogs({ abi: vetraAbi, logs: receipt.logs, eventName })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hit = parsed.find((l: any) => l.args.target?.toLowerCase() === target.toLowerCase())
  if (hit) return

  return pollForEvent(client, receipt.blockNumber, target, eventName)
}

// Polls eth_getLogs from startBlock to current head until the event appears.
async function pollForEvent(
  client: PublicClient,
  startBlock: bigint,
  target: Address,
  eventName: 'DataFetched' | 'ReputationAnalyzed',
  maxAttempts = 60,
): Promise<void> {
  const event = eventName === 'DataFetched' ? DATA_FETCHED_EVENT : REPUTATION_ANALYZED_EVENT

  for (let i = 0; i < maxAttempts; i++) {
    const currentBlock = await client.getBlockNumber()
    if (currentBlock >= startBlock) {
      const logs = await client.getLogs({
        address: VETRA_ADDRESS,
        event,
        args: { target },
        fromBlock: startBlock,
        toBlock: currentBlock,
      })
      if (logs.length > 0) return
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error(`Timeout waiting for ${eventName} — check VetraConsumer's RitualWallet balance`)
}
