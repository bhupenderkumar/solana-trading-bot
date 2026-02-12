import { useState, useEffect } from 'react'
import { Wallet, Copy, Check, ExternalLink, RefreshCw, Zap, LogOut } from 'lucide-react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import api from '../services/api'

export default function WalletConnect() {
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet()
  const { connection } = useConnection()
  const { setVisible } = useWalletModal()
  const [balance, setBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [copied, setCopied] = useState(false)
  const [registering, setRegistering] = useState(false)

  // Fetch balance when connected
  useEffect(() => {
    let mounted = true
    
    const fetchBalance = async () => {
      if (!publicKey || !connected) {
        setBalance(null)
        return
      }
      
      setLoadingBalance(true)
      try {
        const bal = await connection.getBalance(publicKey)
        if (mounted) {
          setBalance(bal / LAMPORTS_PER_SOL)
        }
      } catch (err) {
        console.error('Failed to fetch balance:', err)
        if (mounted) setBalance(null)
      } finally {
        if (mounted) setLoadingBalance(false)
      }
    }

    fetchBalance()
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000)
    
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [publicKey, connected, connection])

  // Register wallet with backend when connected
  useEffect(() => {
    const registerWallet = async () => {
      if (!publicKey || !connected) return
      
      setRegistering(true)
      try {
        await api.post('/api/auth/wallet/connect', {
          public_key: publicKey.toBase58(),
          wallet_type: wallet?.adapter.name || 'unknown'
        })
        console.log('Wallet registered with backend')
      } catch (err) {
        // Ignore errors - wallet can still work without backend registration
        console.log('Backend wallet registration skipped:', err)
      } finally {
        setRegistering(false)
      }
    }
    
    registerWallet()
  }, [publicKey, connected, wallet])

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const refreshBalance = async () => {
    if (!publicKey) return
    setLoadingBalance(true)
    try {
      const bal = await connection.getBalance(publicKey)
      setBalance(bal / LAMPORTS_PER_SOL)
    } catch (err) {
      console.error('Failed to refresh balance:', err)
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleConnect = () => {
    setVisible(true)
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
    } catch (err) {
      console.error('Disconnect error:', err)
    }
  }

  // Not connected - show connect button
  if (!connected) {
    return (
      <div className="bg-dark-800 rounded-xl p-4 border border-dark-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary-400" />
            <span className="font-medium text-white">Connect Wallet</span>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {connecting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Connect
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-dark-400 mt-3">
          Connect your Phantom or Solflare wallet to trade on Devnet
        </p>
      </div>
    )
  }

  // Connected - show wallet info
  const walletAddress = publicKey?.toBase58() || ''
  const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`

  return (
    <div className="bg-dark-800 rounded-xl p-4 border border-success-500/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
          <span className="font-medium text-white">
            {wallet?.adapter.name || 'Wallet'}
          </span>
          <span className="text-xs bg-success-500/20 text-success-400 px-2 py-0.5 rounded-full">
            Devnet
          </span>
        </div>
        <button
          onClick={handleDisconnect}
          className="text-dark-400 hover:text-red-400 transition-colors p-1"
          title="Disconnect wallet"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* Address */}
      <div className="flex items-center gap-2 bg-dark-900 rounded-lg p-2.5 mb-3">
        <code className="text-sm text-success-400 flex-1">{shortAddress}</code>
        <button
          onClick={copyAddress}
          className="text-dark-400 hover:text-white transition-colors p-1"
          title="Copy address"
        >
          {copied ? <Check className="h-4 w-4 text-success-400" /> : <Copy className="h-4 w-4" />}
        </button>
        <a
          href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dark-400 hover:text-primary-400 transition-colors p-1"
          title="View on Solana Explorer"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Balance */}
      <div className="flex items-center justify-between bg-dark-900/50 rounded-lg p-2.5">
        <div>
          <span className="text-xs text-dark-400">Balance</span>
          <div className="flex items-center gap-2">
            {loadingBalance ? (
              <RefreshCw className="h-4 w-4 text-dark-400 animate-spin" />
            ) : (
              <span className="text-lg font-semibold text-white">
                {balance !== null ? balance.toFixed(4) : '---'} SOL
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshBalance}
            disabled={loadingBalance}
            className="text-dark-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-dark-700"
            title="Refresh balance"
          >
            <RefreshCw className={`h-4 w-4 ${loadingBalance ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="https://faucet.solana.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-primary-500/20 text-primary-400 px-2.5 py-1.5 rounded-lg hover:bg-primary-500/30 transition-colors"
          >
            Get SOL
          </a>
        </div>
      </div>

      {registering && (
        <p className="text-xs text-dark-400 mt-2 flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Syncing with backend...
        </p>
      )}
    </div>
  )
}
