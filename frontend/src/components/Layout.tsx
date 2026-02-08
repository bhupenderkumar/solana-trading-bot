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
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/chat', icon: MessageSquare, label: 'Trading Assistant' },
    { path: '/history', icon: History, label: 'Trade History' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-dark-900">
      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-grid opacity-50 pointer-events-none" />

      {/* Header */}
      <header className="glass-strong sticky top-0 z-40 border-b border-dark-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo and Nav */}
            <div className="flex items-center gap-6 lg:gap-10">
              <Link to="/" className="flex items-center gap-2.5 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary-500/30 rounded-xl blur-lg group-hover:bg-primary-500/40 transition-colors" />
                  <div className="relative p-2 bg-gradient-to-br from-primary-500/20 to-primary-600/20 rounded-xl border border-primary-500/30 group-hover:border-primary-400/50 transition-all">
                    <Zap className="h-5 w-5 text-primary-400" />
                  </div>
                </div>
                <div className="hidden sm:block">
                  <span className="text-lg font-bold tracking-tight text-gradient-brand">SolTrader</span>
                  <span className="text-xs text-dark-400 block -mt-0.5">Automated Trading</span>
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
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-primary-500/15 text-primary-400 shadow-inner-glow'
                          : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
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
              {/* Status indicators */}
              <div className="hidden sm:flex items-center gap-3 px-3 py-2 bg-dark-800/50 rounded-lg border border-dark-700/50">
                <div className="flex items-center gap-2" title="Drift Protocol Connection">
                  <div className={`relative ${health?.drift_connected ? 'status-dot-active' : ''}`}>
                    <div className={`w-2 h-2 rounded-full ${health?.drift_connected ? 'bg-success-500' : 'bg-danger-500'}`} />
                  </div>
                  <span className="text-xs text-dark-400 font-medium">Drift</span>
                </div>
                <div className="w-px h-4 bg-dark-600" />
                <div className="flex items-center gap-2" title="Scheduler Status">
                  <div className={`relative ${health?.scheduler_running ? 'status-dot-active' : ''}`}>
                    <div className={`w-2 h-2 rounded-full ${health?.scheduler_running ? 'bg-success-500' : 'bg-danger-500'}`} />
                  </div>
                  <span className="text-xs text-dark-400 font-medium">Scheduler</span>
                </div>
              </div>

              {/* User/Wallet section */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-dark-600 pl-3 pr-2 py-2 rounded-lg transition-all duration-200"
                >
                  {wallet ? (
                    <>
                      <div className="p-1 bg-success-500/20 rounded">
                        <Wallet className="h-3.5 w-3.5 text-success-400" />
                      </div>
                      <span className="text-sm font-medium font-mono hidden sm:block">
                        {wallet.public_key.slice(0, 4)}...{wallet.public_key.slice(-4)}
                      </span>
                    </>
                  ) : (
                    <>
                      <User className="h-4 w-4 text-dark-400" />
                      <span className="text-sm text-dark-400 hidden sm:block">
                        {isLoading ? 'Loading...' : 'Guest'}
                      </span>
                    </>
                  )}
                  <ChevronDown className={`h-4 w-4 text-dark-400 transition-transform duration-200 ${showMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 mt-2 w-80 card overflow-hidden z-50 animate-scale-in">
                      <div className="p-4 border-b border-dark-700/50 bg-dark-800/30">
                        <p className="text-2xs uppercase tracking-wider text-dark-500 font-semibold mb-1.5">Session Token</p>
                        <code className="text-xs text-primary-400 break-all font-mono bg-dark-900/50 px-2 py-1 rounded block">
                          {token?.slice(0, 28)}...
                        </code>
                      </div>

                      {wallet && (
                        <div className="p-4 border-b border-dark-700/50">
                          <p className="text-2xs uppercase tracking-wider text-dark-500 font-semibold mb-1.5">Connected Wallet</p>
                          <code className="text-xs text-success-400 break-all font-mono bg-dark-900/50 px-2 py-1 rounded block">
                            {wallet.public_key}
                          </code>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          logout()
                          setShowMenu(false)
                        }}
                        className="w-full p-4 text-left text-sm text-danger-400 hover:bg-danger-500/10 flex items-center gap-2.5 transition-colors"
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
                className="md:hidden p-2 text-dark-400 hover:text-white hover:bg-dark-700/50 rounded-lg transition-colors"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <nav className="md:hidden mt-4 pb-2 border-t border-dark-700/50 pt-4 animate-fade-up">
              <div className="flex flex-col gap-1">
                {navItems.map(item => {
                  const isActive = location.pathname === item.path
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-primary-500/15 text-primary-400'
                          : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </NavLink>
                  )
                })}
              </div>

              {/* Mobile status */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-dark-700/50 px-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${health?.drift_connected ? 'bg-success-500' : 'bg-danger-500'}`} />
                  <span className="text-xs text-dark-400">Drift</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${health?.scheduler_running ? 'bg-success-500' : 'bg-danger-500'}`} />
                  <span className="text-xs text-dark-400">Scheduler</span>
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 md:py-8 relative z-10">
        <div className="animate-in">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-700/50 py-4 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="flex items-center justify-center gap-2 text-dark-500 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning-500/70" />
            <span>Trading involves risk. Only trade with funds you can afford to lose.</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
