import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { ritualChain } from './ritual'

// When multiple wallet extensions are installed, EIP-5749 populates
// window.ethereum.providers[]. We need to pick MetaMask explicitly
// instead of taking whichever extension won the window.ethereum race.
function getMetaMaskProvider() {
  if (typeof window === 'undefined') return undefined
  const eth = (window as any).ethereum
  if (!eth) return undefined
  if (Array.isArray(eth.providers)) {
    return (
      eth.providers.find(
        (p: any) => p.isMetaMask && !p.isBraveWallet && !p.isCoinbaseWallet,
      ) ??
      eth.providers.find((p: any) => p.isMetaMask) ??
      eth
    )
  }
  return eth
}

export const wagmiConfig = createConfig({
  chains: [ritualChain],
  ssr: true,
  transports: {
    [ritualChain.id]: http('https://rpc.ritualfoundation.org'),
  },
  connectors: [
    injected({
      target() {
        return {
          id: 'metaMask',
          name: 'MetaMask',
          provider: getMetaMaskProvider(),
        }
      },
    }),
  ],
})
