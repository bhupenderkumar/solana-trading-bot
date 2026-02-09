import { ReactNode, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Zap,
  AlertTriangle,
  Wallet,
  LogOut,
  User,
  LayoutDashboard,
  History,
  Settings,
  Menu,
  X,
  ChevronDown,
  MessageSquare
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

  const { token, wallet, logout, isLoading } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/chat', icon: MessageSquare, label: 'Chat', highlight: true },
    { path: '/history', icon: History, label: 'History' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Mesh gradient background */}
      <div className="fixed inset-0 gradient-mesh pointer-events-none" />
      <div className="fixed inset-0 bg-dots pointer-events-none opacity-50" />

      {/* Header */}
      <header className="glass-strong sticky top-0 z-40 border-b border-gray-700/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo and Nav */}
            <div className="flex items-center gap-6 lg:gap-10">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500/20 rounded-xl blur-xl group-hover:bg-indigo-500/30 transition-all duration-500" />
                  <div className="relative p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-xl border border-indigo-500/20 group-hover:border-indigo-400/40 transition-all duration-300 hover-lift">
                    <Zap className="h-5 w-5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                  </div>
                </div>
                <div className="hidden sm:block">
                  <span className="text-lg font-bold tracking-tight text-indigo-400">SolTrader</span>
                  <span className="text-xs text-gray-500 block -mt-0.5">Intelligent Trading</span>
                </div>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map(item => {
                  const isActive = location.pathname === item.path
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        isActive
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner-glow'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  )
                })}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Primary Chat CTA Button */}
              <Link
                to="/chat"
                className="btn-primary py-2 px-4 flex items-center gap-2 text-sm"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Open Chat</span>
              </Link>

              {/* Status indicators */}
              <div className="hidden lg:flex items-center gap-3 px-4 py-2.5 bg-gray-900/50 rounded-xl border border-gray-700/30">
                <div className="flex items-center gap-2" title="Drift Protocol Connection">
                  <div className={`status-dot ${health?.drift_connected ? 'status-dot-active' : 'status-dot-inactive'}`} />
                  <span className="text-xs text-gray-400 font-medium">Drift</span>
                </div>
                <div className="w-px h-4 bg-gray-700/50" />
                <div className="flex items-center gap-2" title="Scheduler Status">
                  <div className={`status-dot ${health?.scheduler_running ? 'status-dot-active' : 'status-dot-inactive'}`} />
                  <span className="text-xs text-gray-400 font-medium">Scheduler</span>
                </div>
              </div>

              {/* User/Wallet section */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-2.5 bg-gray-900/50 hover:bg-gray-800/50 border border-gray-700/30 hover:border-gray-600/50 pl-3 pr-2.5 py-2 rounded-xl transition-all duration-300"
                >
                  {wallet ? (
                    <>
                      <div className="p-1.5 bg-emerald-500/15 rounded-lg">
                        <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <span className="text-sm font-medium font-mono hidden sm:block text-gray-200">
                        {wallet.public_key.slice(0, 4)}...{wallet.public_key.slice(-4)}
                      </span>
                    </>
                  ) : (
                    <>
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-400 hidden sm:block">
                        {isLoading ? 'Loading...' : 'Guest'}
                      </span>
                    </>
                  )}
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${showMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 mt-2 w-80 card overflow-hidden z-50 animate-scale-in">
                      <div className="p-4 border-b border-gray-700/30 bg-gray-800/30">
                        <p className="text-2xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Session Token</p>
                        <code className="text-xs text-indigo-400 break-all font-mono bg-gray-900/50 px-3 py-2 rounded-lg block">
                          {token?.slice(0, 28)}...
                        </code>
                      </div>

                      {wallet && (
                        <div className="p-4 border-b border-gray-700/30">
                          <p className="text-2xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Connected Wallet</p>
                          <code className="text-xs text-emerald-400 break-all font-mono bg-gray-900/50 px-3 py-2 rounded-lg block">
                            {wallet.public_key}
                          </code>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          logout()
                          setShowMenu(false)
                        }}
                        className="w-full p-4 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-all duration-300"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="font-medium">Clear Session & Logout</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <nav className="md:hidden mt-4 pb-2 border-t border-gray-700/30 pt-4 animate-slide-down">
              <div className="flex flex-col gap-1">
                {navItems.map(item => {
                  const isActive = location.pathname === item.path
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        isActive
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </NavLink>
                  )
                })}
              </div>

              {/* Mobile status */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700/30 px-4">
                <div className="flex items-center gap-2">
                  <div className={`status-dot ${health?.drift_connected ? 'status-dot-active' : 'status-dot-inactive'}`} />
                  <span className="text-xs text-gray-400">Drift</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`status-dot ${health?.scheduler_running ? 'status-dot-active' : 'status-dot-inactive'}`} />
                  <span className="text-xs text-gray-400">Scheduler</span>
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 md:py-8 relative z-10">
        <div className="page-enter">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700/30 py-5 relative z-10 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="flex items-center justify-center gap-2.5 text-gray-500 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500/70" />
            <span>Trading involves risk. Only trade with funds you can afford to lose.</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
