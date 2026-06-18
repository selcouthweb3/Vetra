'use client'

import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { RITUAL_WALLET, ritualWalletAbi } from '@/lib/ritual'
import { useState } from 'react'

export function WalletBar() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()
  const { writeContractAsync }   = useWriteContract()
  const [depositing, setDepositing] = useState(false)

  const { data: balance, refetch } = useReadContract({
    address: RITUAL_WALLET,
    abi: ritualWalletAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })

  async function deposit() {
    if (!address) return
    setDepositing(true)
    try {
      // Deposit 0.1 RITUAL, locked for 100,000 blocks (~9.7h) — never shortens
      await writeContractAsync({
        address: RITUAL_WALLET,
        abi: ritualWalletAbi,
        functionName: 'deposit',
        args: [100_000n],
        value: parseEther('0.1'),
      })
      await refetch()
    } catch (e) {
      console.error('Deposit failed', e)
    } finally {
      setDepositing(false)
    }
  }

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {connectors.map(c => (
          <button
            key={c.id}
            onClick={() => connect({ connector: c })}
            style={btnStyle('#19D184')}
          >
            Connect {c.name}
          </button>
        ))}
      </div>
    )
  }

  const formattedBalance = balance !== undefined
    ? `${Number(formatEther(balance)).toFixed(4)} RITUAL`
    : '…'

  const needsDeposit = balance !== undefined && balance < parseEther('0.05')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <span style={{ color: '#9CA3AF', fontSize: '12px', fontFamily: 'monospace' }}>
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>

      <span style={{
        color: needsDeposit ? '#FACC15' : '#19D184',
        fontSize: '12px',
      }}>
        {formattedBalance}
      </span>

      {needsDeposit && (
        <button
          onClick={deposit}
          disabled={depositing}
          style={btnStyle('#FACC15')}
          title="Deposit 0.1 RITUAL fee reserve"
        >
          {depositing ? 'Depositing…' : '+ Deposit Fees'}
        </button>
      )}

      <button
        onClick={() => disconnect()}
        style={{ ...btnStyle('#374151'), color: '#6B7280' }}
      >
        Disconnect
      </button>
    </div>
  )
}

function btnStyle(accent: string) {
  return {
    background: 'transparent',
    border: `1px solid ${accent}`,
    borderRadius: '6px',
    color: accent,
    padding: '5px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }
}
