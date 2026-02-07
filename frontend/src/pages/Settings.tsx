import { useState } from 'react'
import {
  Bell,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  RefreshCw,
  Shield,
  Trash2,
  Download,
  ChevronRight
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <div className="card rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-1 text-white">{title}</h3>
      {description && (
        <p className="text-sm text-dark-400 mb-4">{description}</p>
      )}
      {children}
    </div>
  )
}

interface ToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

function Toggle({ enabled, onChange, disabled }: ToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-primary-600' : 'bg-dark-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function Settings() {
  const { logout, wallet } = useAuth()
  const [notifications, setNotifications] = useState(true)
  const [sounds, setSounds] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [confirmTrades, setConfirmTrades] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState('10')

  return (
    <div className="max-w-3xl mx-auto animate-in">
      <h1 className="text-3xl font-bold mb-2 text-white">Settings</h1>
      <p className="text-dark-400 mb-8">Manage your trading bot preferences</p>

      <div className="space-y-6">
        {/* Notifications */}
        <SettingsSection
          title="Notifications"
          description="Configure how you want to be notified about trading events"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-dark-400" />
                <div>
                  <p className="font-medium text-white">Push Notifications</p>
                  <p className="text-sm text-dark-400">Get notified when rules are triggered</p>
                </div>
              </div>
              <Toggle enabled={notifications} onChange={setNotifications} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {sounds ? (
                  <Volume2 className="h-5 w-5 text-dark-400" />
                ) : (
                  <VolumeX className="h-5 w-5 text-dark-400" />
                )}
                <div>
                  <p className="font-medium text-white">Sound Alerts</p>
                  <p className="text-sm text-dark-400">Play sound when trades execute</p>
                </div>
              </div>
              <Toggle enabled={sounds} onChange={setSounds} />
            </div>
          </div>
        </SettingsSection>

        {/* Display */}
        <SettingsSection
          title="Display"
          description="Customize how the dashboard looks"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {darkMode ? (
                  <Moon className="h-5 w-5 text-dark-400" />
                ) : (
                  <Sun className="h-5 w-5 text-dark-400" />
                )}
                <div>
                  <p className="font-medium text-white">Dark Mode</p>
                  <p className="text-sm text-dark-400">Use dark theme</p>
                </div>
              </div>
              <Toggle enabled={darkMode} onChange={setDarkMode} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-dark-400" />
                <div>
                  <p className="font-medium text-white">Auto Refresh</p>
                  <p className="text-sm text-dark-400">Automatically refresh price data</p>
                </div>
              </div>
              <Toggle enabled={autoRefresh} onChange={setAutoRefresh} />
            </div>

            {autoRefresh && (
              <div className="ml-8 mt-2">
                <label className="text-sm text-dark-400 block mb-2">Refresh Interval</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(e.target.value)}
                  className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 text-white"
                >
                  <option value="3">3 seconds</option>
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                </select>
              </div>
            )}
          </div>
        </SettingsSection>

        {/* Trading */}
        <SettingsSection
          title="Trading"
          description="Configure trading safety settings"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-dark-400" />
                <div>
                  <p className="font-medium text-white">Confirm Trades</p>
                  <p className="text-sm text-dark-400">Ask for confirmation before executing trades</p>
                </div>
              </div>
              <Toggle enabled={confirmTrades} onChange={setConfirmTrades} />
            </div>
          </div>
        </SettingsSection>

        {/* Data Management */}
        <SettingsSection
          title="Data & Privacy"
          description="Manage your data and session"
        >
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-3 bg-dark-700/50 hover:bg-dark-700 rounded-xl transition-colors group">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-dark-400" />
                <span className="text-white">Export Trading Data</span>
              </div>
              <ChevronRight className="h-4 w-4 text-dark-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear your session? This will log you out.')) {
                  logout()
                }
              }}
              className="w-full flex items-center justify-between p-3 bg-danger-500/10 hover:bg-danger-500/20 border border-danger-500/30 rounded-xl transition-colors text-danger-400"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5" />
                <span>Clear Session Data</span>
              </div>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </SettingsSection>

        {/* Wallet Info */}
        {wallet && (
          <SettingsSection title="Connected Wallet">
            <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
              <p className="text-xs text-dark-400 mb-1 font-medium">Public Key</p>
              <code className="text-sm text-success-400 break-all">{wallet.public_key}</code>
              <p className="text-xs text-dark-500 mt-3">
                This is a devnet wallet for testing purposes only.
              </p>
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
