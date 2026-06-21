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

// Account-free public client used for all read-only calls.
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
        const [rawOutput, , exists] = await rawClient.readContract({
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

      // 2. Pick executors
      setPhase('fetching-executor')

      // Diagnostic: compare wagmi publicClient vs rawClient transports.
      const wagmiTransport = (publicClient as any).transport
      const rawTransport   = (rawClient as any).transport
      console.log('[useVetra] client transports', {
        wagmiChainId:   publicClient.chain?.id,
        wagmiUrl:       wagmiTransport?.url ?? wagmiTransport?.transports?.map((t: any) => t?.value?.url),
        rawClientUrl:   rawTransport?.url,
        rawClientChain: rawClient.chain?.id,
      })

      if (publicClient.chain?.id !== 1979) {
        throw new Error(`Wrong network — please switch MetaMask to Ritual Testnet (chain 1979). Currently on chain ${publicClient.chain?.id}.`)
      }

      let executor: Address
      let llmExecutor: Address
      try {
        const httpArgs = [0, true, BigInt(Date.now()), 5n] as const
        console.log('[useVetra] calling pickServiceByCapability via rawClient (HTTP)', {
          address: TEE_REGISTRY, args: httpArgs.map(String),
        })
        const [httpAddr, httpFound] = await rawClient.readContract({
          address: TEE_REGISTRY,
          abi: teeRegistryAbi,
          functionName: 'pickServiceByCapability',
          args: httpArgs,
        })
        console.log('[useVetra] HTTP executor result', { httpAddr, httpFound })
        if (!httpFound) throw new Error('no-service')
        executor = httpAddr as Address

        const llmArgs = [1, true, BigInt(Date.now() + 1), 5n] as const
        console.log('[useVetra] calling pickServiceByCapability via rawClient (LLM)', {
          address: TEE_REGISTRY, args: llmArgs.map(String),
        })
        const [llmAddr, llmFound] = await rawClient.readContract({
          address: TEE_REGISTRY,
          abi: teeRegistryAbi,
          functionName: 'pickServiceByCapability',
          args: llmArgs,
        })
        console.log('[useVetra] LLM executor result', { llmAddr, llmFound })
        if (!llmFound) throw new Error('no-service')
        llmExecutor = llmAddr as Address
      } catch (registryErr) {
        console.error('[useVetra] registry error (full object)', registryErr)
        const raw = registryErr instanceof Error ? registryErr.message : String(registryErr)
        if (raw === 'no-service') {
          throw new Error('No Ritual precompile service registered for this capability — try again later')
        }
        throw new Error(`Ritual registry call failed: ${raw}`)
      }

      console.log('[useVetra] registry done', { executor, llmExecutor })

      console.log('[useVetra] abortRef before TX1', abortRef.current)
      if (abortRef.current) return

      console.log('[useVetra] walletClient state', {
        wc: !!wc,
        account: wc?.account?.address,
        chain: wc?.chain?.id,
      })

      // 3. TX1: fetchData — HTTP precompile (short-running async)
      // Must use sendTransaction + encodeFunctionData, NOT writeContractAsync,
      // because writeContractAsync breaks on async precompile fulfilled replay.
      console.log('[useVetra] setting phase tx1-pending')
      setPhase('tx1-pending')
      console.log('[useVetra] encoding fetchData call', { target, executor, ttl: String(TTL) })
      const data1 = encodeFunctionData({
        abi: vetraAbi,
        functionName: 'fetchData',
        args: [target, executor as Address, TTL],
      })
      console.log('[useVetra] data1 length', data1.length)

      console.log('[useVetra] about to send TX1', {
        to: VETRA_ADDRESS,
        gas: '800000',
        dataPrefix: data1.slice(0, 20),
      })
      let hash1: Hex
      try {
        hash1 = await wc.sendTransaction({
          to: VETRA_ADDRESS,
          data: data1,
          gas: 800_000n,
        })
        console.log('[useVetra] TX1 submitted', hash1)
      } catch (txErr) {
        console.error('[useVetra] TX1 sendTransaction failed', txErr)
        throw txErr
      }
      setTxHash1(hash1)

      // Wait for the fulfilled replay — DataFetched event confirms settlement
      setPhase('tx1-settling')
      await waitForEvent(rawClient, hash1, target, 'DataFetched')

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
        gas: 1_500_000n,
      })
      setTxHash2(hash2)

      setPhase('tx2-settling')
      await waitForEvent(rawClient, hash2, target, 'ReputationAnalyzed')

      if (abortRef.current) return

      // 5. Read and decode the cached result
      const [finalOutput, ,] = await rawClient.readContract({
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
  }, [publicClient, account])  // publicClient kept for chain-ID guard only

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

// Checks receipt logs first (fast path), then polls for the fulfilled-replay TX.
// The commitment TX receipt has empty logs; the actual event is emitted when the
// Ritual executor settles the precompile call in a separate fulfilled-replay TX.
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

  // Try receipt logs first — covers same-block settlement and future sync paths.
  const parsed = parseEventLogs({ abi: vetraAbi, logs: receipt.logs, eventName })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hit = parsed.find((l: any) => l.args.target?.toLowerCase() === target.toLowerCase())
  if (hit) return

  // Async precompile: the fulfilled-replay TX arrives in a later block.
  return pollForEvent(client, receipt.blockNumber, target, eventName)
}

// Polls eth_getLogs from startBlock to the current head until the event appears.
// Guard: only query when currentBlock >= startBlock to avoid fromBlock > toBlock errors
// (different RPC nodes may briefly disagree on head block by a few blocks).
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
    await sleep(2000)
  }
  throw new Error(`Timeout waiting for ${eventName} — check VetraConsumer's RitualWallet balance`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
