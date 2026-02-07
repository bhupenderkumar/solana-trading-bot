import { FC, ReactNode, useMemo, useCallback, useEffect, useState, createContext, useContext } from 'react'
import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base'
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

// Wallet Error Context for sharing errors across components
interface WalletErrorInfo {
  name: string
  message: string
  userMessage: string
  timestamp: number
}

interface WalletErrorContextType {
  lastError: WalletErrorInfo | null
  clearError: () => void
}

const WalletErrorContext = createContext<WalletErrorContextType>({
  lastError: null,
  clearError: () => {},
})

export function useWalletError() {
  return useContext(WalletErrorContext)
}

interface SolanaWalletProviderProps {
  children: ReactNode
}

// Custom hook for connection status
export function useConnectionStatus() {
  const { connection } = useConnection()
  const [isConnected, setIsConnected] = useState(false)
  const [latency, setLatency] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    
    const checkConnection = async () => {
      const start = Date.now()
      try {
        const version = await connection.getVersion()
        if (mounted) {
          setLatency(Date.now() - start)
          setIsConnected(true)
          setError(null)
          console.log('Solana RPC connected:', version)
        }
      } catch (err) {
        if (mounted) {
          setIsConnected(false)
          setError((err as Error).message)
          console.error('Solana RPC connection failed:', err)
        }
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 30000) // Check every 30 seconds

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [connection])

  return { isConnected, latency, error }
}

// Inner provider component that has access to wallet context
const WalletConnectionManager: FC<{ children: ReactNode }> = ({ children }) => {
  const { wallet, publicKey, connected, connecting, disconnecting } = useWallet()
  
  useEffect(() => {
    if (connected && publicKey) {
      console.log('Wallet connected:', {
        name: wallet?.adapter.name,
        publicKey: publicKey.toBase58(),
      })
    }
  }, [connected, publicKey, wallet])

  useEffect(() => {
    if (connecting) {
      console.log('Wallet connecting...')
    }
    if (disconnecting) {
      console.log('Wallet disconnecting...')
    }
  }, [connecting, disconnecting])

  return <>{children}</>
}

// Get user-friendly error message
function getUserFriendlyMessage(error: WalletError): string {
  switch (error.name) {
    case 'WalletNotReadyError':
      return 'Please install a Solana wallet extension (e.g., Phantom, Solflare)'
    case 'WalletConnectionError':
      if (error.message.includes('User rejected') || error.message.includes('rejected')) {
        return 'Connection was cancelled. Click "Select Wallet" to try again.'
      }
      return 'Failed to connect to wallet. Please make sure your wallet is unlocked and try again.'
    case 'WalletDisconnectedError':
      return 'Wallet was disconnected. Please reconnect to continue.'
    case 'WalletSignTransactionError':
      return 'Transaction signing was cancelled or failed.'
    case 'WalletTimeoutError':
      return 'Wallet connection timed out. Please try again.'
    case 'WalletWindowClosedError':
      return 'Wallet popup was closed. Please try connecting again.'
    default:
      if (error.message.includes('User rejected')) {
        return 'Connection was cancelled by user.'
      }
      return error.message || 'An unexpected wallet error occurred.'
  }
}

const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ children }) => {
  const [lastError, setLastError] = useState<WalletErrorInfo | null>(null)
  
  // Use devnet for testing - can be configured via env
  const network = WalletAdapterNetwork.Devnet
  
  // Use multiple RPC endpoints for reliability
  const endpoint = useMemo(() => {
    // Check for custom RPC endpoint in env
    const customEndpoint = import.meta.env.VITE_SOLANA_RPC_URL
    if (customEndpoint) {
      console.log('Using custom Solana RPC:', customEndpoint)
      return customEndpoint
    }
    
    const defaultEndpoint = clusterApiUrl(network)
    console.log('Using default Solana RPC:', defaultEndpoint)
    return defaultEndpoint
  }, [network])

  // Connection config with better settings
  const connectionConfig = useMemo(() => ({
    commitment: 'confirmed' as const,
    confirmTransactionInitialTimeout: 60000,
    disableRetryOnRateLimit: false,
  }), [])

  // Explicitly add wallet adapters for better compatibility
  // Wallet-standard auto-detection can be unreliable in some environments
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network }),
  ], [network])

  const clearError = useCallback(() => {
    setLastError(null)
  }, [])

  // Handle wallet errors gracefully
  const onError = useCallback((error: WalletError) => {
    const userMessage = getUserFriendlyMessage(error)
    
    console.error('Wallet error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as any).cause,
    })
    console.info('User message:', userMessage)
    
    setLastError({
      name: error.name,
      message: error.message,
      userMessage,
      timestamp: Date.now(),
    })
    
    // Auto-clear error after 10 seconds
    setTimeout(() => {
      setLastError(prev => {
        // Only clear if it's the same error
        if (prev && prev.timestamp === Date.now()) {
          return null
        }
        return prev
      })
    }, 10000)
  }, [])

  const errorContextValue = useMemo(() => ({
    lastError,
    clearError,
  }), [lastError, clearError])

  return (
    <WalletErrorContext.Provider value={errorContextValue}>
      <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
        <WalletProvider
          wallets={wallets}
          autoConnect={false}
          onError={onError}
        >
          <WalletModalProvider>
            <WalletConnectionManager>
              {children}
            </WalletConnectionManager>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </WalletErrorContext.Provider>
  )
}

export default SolanaWalletProvider
