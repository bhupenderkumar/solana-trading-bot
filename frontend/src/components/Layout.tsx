import { ReactNode, useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  Bot,
  AlertTriangle,
  Wallet,
  LogOut,
  LayoutDashboard,
  History,
  Settings,
  Menu,
  X,
  Terminal,
  Activity,
  Shield,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Coins
} from 'lucide-react'
import { healthApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.check,
    refetchInterval: 10000,
  })

  const { wallet, logout, createWallet } = useAuth()
  
  // Solana wallet adapter hooks
  const { publicKey, connected } = useWallet()
  const { connection } = useConnection()
  const { setVisible } = useWalletModal()
  
  const [showMenu, setShowMenu] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [creatingWallet, setCreatingWallet] = useState(false)
  const [copied, setCopied] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [solBalance, setSolBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Fetch SOL balance when wallet is connected
  useEffect(() => {
    let mounted = true
    
    const fetchBalance = async () => {
      if (!publicKey || !connected) {
        setSolBalance(null)
        return
      }
      
      setLoadingBalance(true)
      try {
        const bal = await connection.getBalance(publicKey)
        if (mounted) {
          setSolBalance(bal / LAMPORTS_PER_SOL)
        }
      } catch (err) {
        console.error('Failed to fetch balance:', err)
        if (mounted) setSolBalance(null)
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

  // Track scroll for header background
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close menu on route change
  useEffect(() => {
    setShowMenu(false)
    setMobileMenuOpen(false)
  }, [location.pathname])

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Agents' },
    { path: '/chat', icon: Terminal, label: 'Console' },
    { path: '/history', icon: History, label: 'History' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  const copyWallet = () => {
    if (wallet?.public_key) {
      navigator.clipboard.writeText(wallet.public_key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isConnected = health?.drift_connected && health?.scheduler_running

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 gradient-mesh pointer-events-none" />
      <div className="fixed inset-0 bg-dots pointer-events-none opacity-50" />

      {/* Header */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled 
            ? 'bg-gray-900/80 backdrop-blur-xl border-b border-gray-700/50 shadow-lg shadow-black/20' 
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-2 lg:gap-6">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-2 group">
                <motion.div 
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative"
                >
                  <div className="absolute inset-0 bg-indigo-500/30 rounded-lg blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative p-1.5 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-lg border border-indigo-500/30">
                    <Bot className="h-4 w-4 text-indigo-400" />
                  </div>
                </motion.div>
                <span className="text-base font-bold text-white hidden sm:block">
                  Agent<span className="text-indigo-400">Fi</span>
                </span>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center">
                <div className="flex items-center bg-gray-800/40 rounded-lg p-0.5 border border-gray-700/30">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className="relative"
                      >
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            isActive
                              ? 'text-white'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="nav-pill"
                              className="absolute inset-0 bg-indigo-500/20 border border-indigo-500/30 rounded-md"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          <item.icon className="h-3.5 w-3.5 relative z-10" />
                          <span className="relative z-10">{item.label}</span>
                        </motion.div>
                      </NavLink>
                    )
                  })}
                </div>
              </nav>
            </div>

            {/* Right: Status + Wallet + Menu */}
            <div className="flex items-center gap-2">
              {/* SOL Balance - Show when connected */}
              {connected && publicKey && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20"
                >
                  <Coins className="h-3.5 w-3.5 text-purple-400" />
                  {loadingBalance ? (
                    <RefreshCw className="h-3 w-3 text-purple-400 animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold text-purple-300">
                      {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : '-- SOL'}
                    </span>
                  )}
                  <span className="text-[10px] text-purple-400/60 font-medium px-1 py-0.5 bg-purple-500/10 rounded">
                    Devnet
                  </span>
                </motion.div>
              )}

              {/* System Status - Compact */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800/40 border border-gray-700/30"
                title={isConnected ? 'All systems operational' : 'Connection issues'}
              >
                <motion.div
                  animate={isConnected ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Activity className={`h-3 w-3 ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
                </motion.div>
                <span className={`text-xs font-medium ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </motion.div>

              {/* Wallet Button */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="relative"
              >
                {wallet ? (
                  <motion.button
                    onClick={() => setShowMenu(!showMenu)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 rounded-lg transition-colors"
                  >
                    <div className="relative">
                      <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                      <motion.div
                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                    </div>
                    <span className="text-xs font-mono text-emerald-400 hidden sm:block">
                      {wallet.public_key.slice(0, 4)}...{wallet.public_key.slice(-4)}
                    </span>
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={async () => {
                      setCreatingWallet(true)
                      try {
                        await createWallet()
                      } catch (e) {
                        console.error('Failed to create wallet:', e)
                      } finally {
                        setCreatingWallet(false)
                      }
                    }}
                    disabled={creatingWallet}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-400 transition-colors disabled:opacity-50"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium hidden sm:block">
                      {creatingWallet ? 'Connecting...' : 'Connect'}
                    </span>
                  </motion.button>
                )}

                {/* Wallet Dropdown */}
                <AnimatePresence>
                  {showMenu && wallet && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowMenu(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
                        className="absolute right-0 mt-2 w-64 bg-gray-900/95 backdrop-blur-xl border border-gray-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50"
                      >
                        {/* Wallet Info */}
                        <div className="p-3 border-b border-gray-700/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <div className="p-1 bg-emerald-500/15 rounded">
                                <Shield className="h-3 w-3 text-emerald-400" />
                              </div>
                              <span className="text-xs font-medium text-white">Connected Wallet</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <motion.button
                                onClick={copyWallet}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className="p-1 hover:bg-gray-800 rounded transition-colors"
                                title="Copy address"
                              >
                                {copied ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3 text-gray-400" />
                                )}
                              </motion.button>
                              <a
                                href={`https://solscan.io/account/${wallet.public_key}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-gray-800 rounded transition-colors"
                                title="View on Solscan"
                              >
                                <ExternalLink className="h-3 w-3 text-gray-400" />
                              </a>
                            </div>
                          </div>
                          <code className="text-[10px] text-emerald-400 font-mono bg-gray-800/50 px-2 py-1.5 rounded block truncate">
                            {wallet.public_key}
                          </code>
                        </div>

                        {/* System Status */}
                        <div className="px-3 py-2 border-b border-gray-700/30 bg-gray-800/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${health?.drift_connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="text-[10px] text-gray-400">Drift</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${health?.scheduler_running ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="text-[10px] text-gray-400">Scheduler</span>
                              </div>
                            </div>
                            <span className={`text-[10px] font-medium ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {isConnected ? 'All Systems Go' : 'Issues'}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="p-1.5">
                          <motion.button
                            onClick={() => {
                              logout()
                              setShowMenu(false)
                            }}
                            whileHover={{ x: 2 }}
                            className="w-full p-2 text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 rounded-lg transition-colors"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span className="font-medium">Disconnect</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Mobile menu button */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <AnimatePresence mode="wait">
                  {mobileMenuOpen ? (
                    <motion.div
                      key="close"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <X className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Menu className="h-5 w-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.nav
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="md:hidden overflow-hidden"
              >
                <div className="pb-3 pt-2 space-y-1">
                  {navItems.map((item, idx) => {
                    const isActive = location.pathname === item.path
                    return (
                      <motion.div
                        key={item.path}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <NavLink
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </NavLink>
                      </motion.div>
                    )
                  })}

                  {/* Mobile Status */}
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-700/30 px-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${health?.drift_connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className="text-xs text-gray-400">Drift</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${health?.scheduler_running ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className="text-xs text-gray-400">Scheduler</span>
                    </div>
                  </motion.div>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 md:py-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer - Minimal */}
      <footer className="border-t border-gray-700/30 py-3 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
            <AlertTriangle className="h-3 w-3 text-amber-500/70" />
            <span>Trading involves risk. Only trade what you can afford to lose.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
