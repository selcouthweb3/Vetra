'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Wallet, Copy, LogOut, Check } from 'lucide-react'
import { toast } from 'sonner'

export function WalletBar() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()
  const [copied, setCopied]      = useState(false)

  function handleConnect() {
    const connector = connectors[0]
    if (!connector) return
    connect(
      { connector },
      {
        onSuccess: () => toast.success('Wallet connected'),
        onError:   (e) => toast.error(e.message),
      }
    )
  }

  function handleCopy() {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDisconnect() {
    disconnect()
    toast.info('Wallet disconnected')
  }

  if (!isConnected) {
    return (
      <button
        onClick={handleConnect}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-violet-400 hover:bg-violet-300 text-zinc-950 text-sm font-semibold transition-all duration-200"
      >
        <Wallet className="w-3.5 h-3.5" />
        Connect Wallet
      </button>
    )
  }

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

  // Deterministic gradient from address bytes
  const hue = address ? parseInt(address.slice(2, 6), 16) % 360 : 0

  return (
    <div className="flex items-center gap-2">
      {/* Avatar + address */}
      <div className="flex items-center gap-2.5 h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900">
        <div
          className="w-5 h-5 rounded-full shrink-0"
          style={{ background: `linear-gradient(135deg, hsl(${hue},70%,60%), hsl(${(hue + 120) % 360},70%,50%))` }}
        />
        <span className="font-mono text-xs text-zinc-300">{short}</span>
      </div>

      {/* Copy */}
      <button
        onClick={handleCopy}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-all duration-200"
        title="Copy address"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      {/* Disconnect */}
      <button
        onClick={handleDisconnect}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-rose-400 hover:border-rose-400/30 transition-all duration-200"
        title="Disconnect"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
