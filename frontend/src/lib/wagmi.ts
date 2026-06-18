import { createConfig, http } from 'wagmi'
import { injected, metaMask } from 'wagmi/connectors'
import { ritualChain } from './ritual'

export const wagmiConfig = createConfig({
  chains: [ritualChain],
  transports: {
    [ritualChain.id]: http('https://rpc.ritualfoundation.org'),
  },
  connectors: [
    metaMask(),
    injected(),
  ],
})
