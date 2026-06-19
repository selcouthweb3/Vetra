import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'
import { WagmiProvider } from '@/providers/WagmiProvider'

export const metadata: Metadata = {
  title: 'Vetra — Address Reputation',
  description: 'On-chain address reputation scoring powered by Ritual AI precompiles',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider>
          {children}
        </WagmiProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
            },
          }}
        />
      </body>
    </html>
  )
}
