'use client'

import { useState, useCallback, useRef } from 'react'
import {
  usePublicClient,
  useWalletClient,
  useReadContract,
  useAccount,
} from 'wagmi'
import { encodeFunctionData, isAddress } from 'viem'
import type { Hex, Address } from 'viem'
import {
  VETRA_ADDRESS,
  vetraAbi,
  TEE_REGISTRY,
  teeRegistryAbi,
  decodeLLMOutput,
  type VerdictResult,
} from '@/lib/ritual'

// ── Types ────────────────────────────────────────────────────────────────────

export type Phase =
  | 'idle'
  | 'checking-cache'
  | 'fetching-executor'
  | 'tx1-pending'       // fetchData TX submitted
  | 'tx1-settling'      // waiting for DataFetched event (fulfilled replay)
  | 'tx2-pending'       // analyzeReputation TX submitted
  | 'tx2-settling'      // waiting for ReputationAnalyzed event
  | 'done'
  | 'error'

export interface UseVetraReturn {
  phase: Phase
  verdict: VerdictResult | null
  txHash1: Hex | null
  txHash2: Hex | null
  error: string | null
  analyze: (target: string) => Promise<void>
  reset: () => void
}

const TTL = 300n  // blocks — safe for HTTP + LLM on Ritual testnet

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVetra(): UseVetraReturn {
  const { address: account } = useAccount()
  const publicClient  = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // walletClient resolves slightly after account on connect — if analyze() closes
  // over walletClient from the deps array it captures undefined and falsely errors.
  // A ref always holds the latest value without making analyze() re-create.
  const walletClientRef = useRef(walletClient)
  walletClientRef.current = walletClient

  const [phase,   setPhase]   = useState<Phase>('idle')
  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [txHash1, setTxHash1] = useState<Hex | null>(null)
  const [txHash2, setTxHash2] = useState<Hex | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const abortRef = useRef(false)

  const reset = useCallback(() => {
    abortRef.current = true
    setPhase('idle')
    setVerdict(null)
    setTxHash1(null)
    setTxHash2(null)
    setError(null)
    // Allow future runs
    setTimeout(() => { abortRef.current = false }, 50)
  }, [])

  const analyze = useCallback(async (targetRaw: string) => {
    const wc = walletClientRef.current
    console.log('[useVetra] analyze called', {
      account,
      walletClient: !!wc,
      publicClient: !!publicClient,
    })

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

    abortRef.current = false
    setPhase('checking-cache')
    setVerdict(null)
    setTxHash1(null)
    setTxHash2(null)
    setError(null)

    try {
      // 1. Check cache — getResult returns 0x (undecodable) when not cached,
      //    so treat any decode error as a cache miss and fall through to the TX flow.
      let cacheHit = false
      try {
        const [rawOutput, , exists] = await publicClient.readContract({
          address: VETRA_ADDRESS,
          abi: vetraAbi,
          functionName: 'getResult',
          args: [target],
        })
        console.log('[useVetra] cache check', { exists, rawOutputLen: (rawOutput as Hex).length })
        if (exists && (rawOutput as Hex).length > 2) {
          setVerdict(decodeLLMOutput(rawOutput as Hex))
          setPhase('done')
          cacheHit = true
        }
      } catch (cacheErr) {
        console.log('[useVetra] cache miss (decode error, proceeding to TX flow)', cacheErr)
      }
      if (cacheHit) return

      // 2. Pick executor
      setPhase('fetching-executor')
      const [executor, found] = await publicClient.readContract({
        address: TEE_REGISTRY,
        abi: teeRegistryAbi,
        functionName: 'pickServiceByCapability',
        args: [
          0,     // HTTP_CALL capability
          true,
          BigInt(Date.now()),
          5n,
        ],
      })
      if (!found) throw new Error('No HTTP executor available in TEEServiceRegistry')

      // Also pick LLM executor (capability 1)
      const [llmExecutor, llmFound] = await publicClient.readContract({
        address: TEE_REGISTRY,
        abi: teeRegistryAbi,
        functionName: 'pickServiceByCapability',
        args: [1, true, BigInt(Date.now() + 1), 5n],
      })
      if (!llmFound) throw new Error('No LLM executor available in TEEServiceRegistry')

      if (abortRef.current) return

      // 3. TX1: fetchData — HTTP precompile (short-running async)
      // Must use sendTransaction + encodeFunctionData, NOT writeContractAsync,
      // because writeContractAsync breaks on async precompile fulfilled replay.
      setPhase('tx1-pending')
      const data1 = encodeFunctionData({
        abi: vetraAbi,
        functionName: 'fetchData',
        args: [target, executor as Address, TTL],
      })

      const hash1 = await wc.sendTransaction({
        to: VETRA_ADDRESS,
        data: data1,
        gas: 3_000_000n,
      })
      setTxHash1(hash1)

      // Wait for the fulfilled replay — DataFetched event confirms settlement
      setPhase('tx1-settling')
      await waitForEvent(publicClient, hash1, target, 'DataFetched')

      if (abortRef.current) return

      // 4. TX2: analyzeReputation — LLM precompile (short-running async)
      setPhase('tx2-pending')
      const data2 = encodeFunctionData({
        abi: vetraAbi,
        functionName: 'analyzeReputation',
        args: [target, llmExecutor as Address, TTL],
      })

      const hash2 = await wc.sendTransaction({
        to: VETRA_ADDRESS,
        data: data2,
        gas: 5_000_000n,
      })
      setTxHash2(hash2)

      setPhase('tx2-settling')
      await waitForEvent(publicClient, hash2, target, 'ReputationAnalyzed')

      if (abortRef.current) return

      // 5. Read and decode the cached result
      const [finalOutput, ,] = await publicClient.readContract({
        address: VETRA_ADDRESS,
        abi: vetraAbi,
        functionName: 'getResult',
        args: [target],
      })

      setVerdict(decodeLLMOutput(finalOutput as Hex))
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

// Full ABI event objects — viem needs all inputs to compute the correct topic0 hash.
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
  ],
} as const

// Waits for the fulfilled-replay TX (a different hash from the commitment TX) to emit
// the settlement event. The commitment TX is mined first; the fulfilled replay arrives
// within TTL blocks (~105s at 300 blocks × 350ms). Poll getLogs on a 400ms cadence.
async function waitForEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any,
  txHash: Hex,
  target: Address,
  eventName: 'DataFetched' | 'ReputationAnalyzed',
): Promise<void> {
  // Wait for the commitment TX to land, then start polling from that block.
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    timeout: 60_000,
  })

  const commitBlock: bigint = receipt.blockNumber ?? 0n
  const event = eventName === 'DataFetched' ? DATA_FETCHED_EVENT : REPUTATION_ANALYZED_EVENT

  // Poll for up to 130s (TTL 300 blocks × ~350ms + buffer)
  const deadline = Date.now() + 130_000
  while (Date.now() < deadline) {
    const head = await publicClient.getBlockNumber()
    // Search from the commitment block to catch the fulfilled-replay TX
    const fromBlock = commitBlock

    const logs = await publicClient.getLogs({
      address: VETRA_ADDRESS,
      event,
      args: { target },
      fromBlock,
      toBlock: head,
    })

    if (logs.length > 0) return

    await sleep(400)
  }

  // Timed out — the TX may have expired. Check on-chain state directly.
  if (eventName === 'ReputationAnalyzed') {
    const exists = await publicClient.readContract({
      address: VETRA_ADDRESS,
      abi: vetraAbi,
      functionName: 'isCached',
      args: [target],
    })
    if (!exists) throw new Error('LLM analysis timed out — check wallet balance in RitualWallet')
  } else {
    const [, , fetched] = await publicClient.readContract({
      address: VETRA_ADDRESS,
      abi: vetraAbi,
      functionName: 'addressData',
      args: [target],
    })
    if (!fetched) throw new Error('fetchData timed out — check wallet balance in RitualWallet')
  }

}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
