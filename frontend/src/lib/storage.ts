// ── Score History ─────────────────────────────────────────────────────────────

export interface ScoreEntry {
  score:       number
  timestamp:   number  // unix seconds
  blockNumber?: number
}

const HISTORY_MAX = 10

function historyKey(address: string) {
  return `vetra_history_${address.toLowerCase()}`
}

export function loadHistory(address: string): ScoreEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(historyKey(address)) ?? '[]')
  } catch {
    return []
  }
}

export function appendHistory(address: string, entry: ScoreEntry): ScoreEntry[] {
  const existing = loadHistory(address)
  // Deduplicate by timestamp (same second = same analysis run)
  const deduped = existing.filter(e => e.timestamp !== entry.timestamp)
  const next = [...deduped, entry].slice(-HISTORY_MAX)
  localStorage.setItem(historyKey(address), JSON.stringify(next))
  return next
}

// ── Community Flags ───────────────────────────────────────────────────────────

export interface Flag {
  flagger:   string   // address or 'anon'
  reason:    string
  timestamp: number   // unix seconds
}

function flagKey(address: string) {
  return `vetra_flags_${address.toLowerCase()}`
}

export function loadFlags(address: string): Flag[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(flagKey(address)) ?? '[]')
  } catch {
    return []
  }
}

export function appendFlag(address: string, flag: Flag): Flag[] {
  const existing = loadFlags(address)
  const next = [...existing, flag]
  localStorage.setItem(flagKey(address), JSON.stringify(next))
  return next
}
