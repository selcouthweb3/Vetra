import { defineChain, decodeAbiParameters, parseAbiParameters } from 'viem'
import type { Hex, Address } from 'viem'

// ── Chain ────────────────────────────────────────────────────────────────────

export const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual Testnet',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ritualfoundation.org'] },
    public:  { http: ['https://rpc.ritualfoundation.org'] },
  },
  blockExplorers: {
    default: { name: 'Ritual Explorer', url: 'https://explorer.ritualfoundation.org' },
  },
  contracts: {
    multicall3: { address: '0x5577Ea679673Ec7508E9524100a188E7600202a3' },
  },
})

// ── Contract ─────────────────────────────────────────────────────────────────

export const VETRA_ADDRESS = (process.env.NEXT_PUBLIC_VETRA_ADDRESS ?? '0x0') as Hex

export const vetraAbi = [
  {
    name: 'isCached',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'target', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'getResult',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'target', type: 'address' }],
    outputs: [
      { name: 'rawOutput',    type: 'bytes'   },
      { name: 'cachedAt',     type: 'uint256' },
      { name: 'cachedAtTime', type: 'uint256' },
      { name: 'requestedBy',  type: 'address' },
      { name: 'exists',       type: 'bool'    },
    ],
  },
  {
    name: 'addressData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'balanceHex', type: 'string' },
      { name: 'txCountHex', type: 'string' },
      { name: 'fetched',    type: 'bool'   },
    ],
  },
  {
    name: 'totalAnalyzed',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'fetchData',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target',   type: 'address' },
      { name: 'executor', type: 'address' },
      { name: 'ttl',      type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'analyzeReputation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target',   type: 'address' },
      { name: 'executor', type: 'address' },
      { name: 'ttl',      type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'DataFetched',
    type: 'event',
    inputs: [
      { name: 'target',     type: 'address', indexed: true  },
      { name: 'balanceHex', type: 'string',  indexed: false },
      { name: 'txCountHex', type: 'string',  indexed: false },
    ],
  },
  {
    name: 'ReputationAnalyzed',
    type: 'event',
    inputs: [
      { name: 'target',      type: 'address', indexed: true  },
      { name: 'blockNumber', type: 'uint256', indexed: false },
      { name: 'requestedBy', type: 'address', indexed: true  },
    ],
  },
] as const

// ── System addresses ──────────────────────────────────────────────────────────

export const RITUAL_WALLET = '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948' as const
export const TEE_REGISTRY   = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F' as const

export const ritualWalletAbi = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'lockDuration', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'lockUntil',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

export const teeRegistryAbi = [
  {
    name: 'pickServiceByCapability',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'capability',    type: 'uint8'   },
      { name: 'checkValidity', type: 'bool'    },
      { name: 'seed',          type: 'uint256' },
      { name: 'maxProbes',     type: 'uint256' },
    ],
    outputs: [
      { name: 'teeAddress', type: 'address' },
      { name: 'found',      type: 'bool'    },
    ],
  },
] as const

// ── LLM output decoder ────────────────────────────────────────────────────────

export interface VerdictResult {
  score:            number    // 0-100, -1 = unknown
  reason:           string
  error?:           string
  requestedBy?:     Address
  cachedAtTimestamp?: number  // unix seconds
  balanceHex?:      string
  txCountHex?:      string
}

// Decodes the raw actualOutput bytes stored on-chain by analyzeReputation().
// Structure: abi.decode(raw, (bool hasError, bytes completionData, bytes modelMetadata,
//                              string errorMessage, (string,string,string) updatedConvoHistory))
export function decodeLLMOutput(raw: Hex): VerdictResult {
  try {
    const [hasError, completionData, , errorMessage] = decodeAbiParameters(
      parseAbiParameters('bool, bytes, bytes, string, (string,string,string)'),
      raw,
    )

    if (hasError) {
      return { score: -1, reason: '', error: errorMessage as string }
    }

    const [, , , , , , choicesCount, choicesData] = decodeAbiParameters(
      parseAbiParameters('string, string, uint256, string, string, string, uint256, bytes[], bytes'),
      completionData as Hex,
    )

    if ((choicesCount as bigint) === 0n || (choicesData as Hex[]).length === 0) {
      return { score: -1, reason: '', error: 'No choices in LLM response' }
    }

    const [, , messageData] = decodeAbiParameters(
      parseAbiParameters('uint256, string, bytes'),
      (choicesData as Hex[])[0],
    )

    const [, content] = decodeAbiParameters(
      parseAbiParameters('string, string, string, uint256, bytes[]'),
      messageData as Hex,
    )

    return parseVerdictFromContent(content as string)
  } catch (e) {
    return { score: -1, reason: '', error: String(e) }
  }
}

function parseVerdictFromContent(raw: string): VerdictResult {
  // GLM-4.7-FP8 emits <think>...</think> blocks before the final answer — strip them.
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) {
    return { score: -1, reason: stripped, error: 'No JSON found in LLM response' }
  }

  try {
    const parsed = JSON.parse(match[0])
    const score  = Number(parsed.score)
    const reason = String(parsed.reason ?? '')

    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return { score: -1, reason, error: `Invalid score: ${parsed.score}` }
    }

    return { score, reason }
  } catch {
    return { score: -1, reason: stripped, error: 'JSON parse failed' }
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export type VerdictLevel = 'safe' | 'caution' | 'danger' | 'unknown'

export function scoreToVerdict(score: number): VerdictLevel {
  if (score < 0)  return 'unknown'
  if (score < 33) return 'safe'
  if (score < 67) return 'caution'
  return 'danger'
}

export const verdictConfig: Record<VerdictLevel, { label: string; colour: string; bg: string; border: string }> = {
  safe:    { label: 'TRUSTED',    colour: '#19D184', bg: 'rgba(25,209,132,0.08)',  border: 'rgba(25,209,132,0.3)'  },
  caution: { label: 'SUSPICIOUS', colour: '#FACC15', bg: 'rgba(250,204,21,0.08)',  border: 'rgba(250,204,21,0.3)'  },
  danger:  { label: 'HIGH RISK',  colour: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)'   },
  unknown: { label: 'UNKNOWN',    colour: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.3)' },
}

// Hex wei string → "X.XXXX ETH" (4 decimal places).
export function hexToEth(hex: string | undefined): string {
  if (!hex || hex === '0x' || hex === '0x0') return '0.0000 ETH'
  try {
    const wei = BigInt(hex)
    const whole = wei / BigInt(1e18)
    const frac  = Number((wei % BigInt(1e18)) / BigInt(1e14))
    return `${whole}.${String(frac).padStart(4, '0')} ETH`
  } catch {
    return '—'
  }
}

// Hex string → decimal string.
export function hexToDecimal(hex: string | undefined): string {
  if (!hex || hex === '0x') return '0'
  try {
    return String(BigInt(hex))
  } catch {
    return '—'
  }
}

// Unix timestamp → human-readable date string.
export function formatTimestamp(unix: number | undefined): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
