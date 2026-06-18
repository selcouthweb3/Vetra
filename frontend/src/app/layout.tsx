import type { Metadata } from "next";
import "./globals.css";
import { WagmiProvider } from "@/providers/WagmiProvider";

export const metadata: Metadata = {
  title: "Vetra — Crypto Address Reputation",
  description: "On-chain address reputation scoring powered by Ritual AI precompiles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider>
          {children}
        </WagmiProvider>
      </body>
    </html>
  );
}
