import { useState } from 'react'
import { Wallet, Copy, Check, AlertTriangle, Key } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function WalletConnect() {
  const { wallet, createWallet, isLoading } = useAuth()
  const [newWallet, setNewWallet] = useState<{
    public_key: string
    private_key: string
    message: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleCreateWallet = async () => {
    setCreating(true)
    try {
      const result = await createWallet()
      setNewWallet(result)
    } catch (error) {
      console.error('Failed to create wallet:', error)
    } finally {
      setCreating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="bg-dark-800 rounded-xl p-4 animate-pulse border border-dark-700/50">
        <div className="h-4 bg-dark-700 rounded w-1/2"></div>
      </div>
    )
  }

  // Show newly created wallet with private key (only shown once)
  if (newWallet) {
    return (
      <div className="bg-dark-800 rounded-xl p-4 border border-warning-500/50">
        <div className="flex items-center gap-2 text-warning-400 mb-3">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">Save Your Private Key!</span>
        </div>

        <p className="text-sm text-dark-300 mb-4">
          This is your DEVNET wallet for testing. The private key will only be shown once.
          Save it somewhere safe!
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-dark-400 font-medium">Public Key</label>
            <div className="flex items-center gap-2 bg-dark-900 rounded-lg p-2 mt-1 border border-dark-700">
              <code className="text-sm text-success-400 flex-1 truncate">
                {newWallet.public_key}
              </code>
              <button
                onClick={() => copyToClipboard(newWallet.public_key)}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-dark-400 flex items-center gap-1 font-medium">
              <Key className="h-3 w-3" />
              Private Key (SAVE THIS!)
            </label>
            <div className="flex items-center gap-2 bg-dark-900 rounded-lg p-2 mt-1 border border-warning-500/30">
              <code className="text-sm text-warning-400 flex-1 break-all">
                {newWallet.private_key}
              </code>
              <button
                onClick={() => copyToClipboard(newWallet.private_key)}
                className="text-dark-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-success-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => setNewWallet(null)}
          className="mt-4 w-full bg-success-600 hover:bg-success-500 text-white py-2.5 rounded-lg transition-colors font-medium"
        >
          I've Saved My Private Key
        </button>
      </div>
    )
  }

  // Show existing wallet or create button
  return (
    <div className="bg-dark-800 rounded-xl p-4 border border-dark-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary-400" />
          <span className="font-medium text-white">Wallet</span>
        </div>

        {wallet ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-dark-400">Connected:</span>
            <code className="text-sm text-success-400">
              {wallet.public_key.slice(0, 8)}...{wallet.public_key.slice(-6)}
            </code>
          </div>
        ) : (
          <button
            onClick={handleCreateWallet}
            disabled={creating}
            className="btn-primary text-sm"
          >
            {creating ? 'Creating...' : 'Create Devnet Wallet'}
          </button>
        )}
      </div>

      {wallet && (
        <div className="mt-3 pt-3 border-t border-dark-700/50">
          <p className="text-xs text-dark-400">
            This is a devnet wallet for testing. To get devnet SOL, use the{' '}
            <a
              href="https://faucet.solana.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              Solana Faucet
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
