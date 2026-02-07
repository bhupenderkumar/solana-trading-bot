import React from 'react'
import ReactDOM from 'react-dom/client'
// Buffer polyfill is now handled by vite-plugin-node-polyfills
import { Buffer } from 'buffer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import SolanaWalletProvider from './contexts/SolanaWalletProvider'
import App from './App'
import './index.css'

// Polyfill Buffer for Solana wallet adapter
// This ensures compatibility with @solana/web3.js and wallet adapters
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer
  window.global = window.global || window
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10000, // Refetch every 10 seconds (reduced to avoid rate limits)
      staleTime: 5000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SolanaWalletProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SolanaWalletProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
