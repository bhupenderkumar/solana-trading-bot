import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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
  ChevronRight,
  Check,
  Save,
  Settings as SettingsIcon
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

// Settings storage key
const SETTINGS_KEY = 'soltrader_settings'

// Default settings
const DEFAULT_SETTINGS = {
  notifications: true,
  sounds: false,
  autoRefresh: true,
  darkMode: true,
  confirmTrades: true,
  refreshInterval: '10'
}

// Load settings from localStorage
function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return DEFAULT_SETTINGS
}

// Save settings to localStorage
function saveSettings(settings: typeof DEFAULT_SETTINGS) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch (e) {
    console.error('Failed to save settings:', e)
    return false
  }
}

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/40 rounded-2xl p-6"
    >
      <h3 className="text-lg font-semibold mb-1 text-white font-heading">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 mb-4">{description}</p>
      )}
      {children}
    </motion.div>
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
        enabled ? 'bg-indigo-500' : 'bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function Settings() {
  const { logout, wallet } = useAuth()
  const [settings, setSettings] = useState(loadSettings)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Track changes
  useEffect(() => {
    const stored = loadSettings()
    const changed = JSON.stringify(stored) !== JSON.stringify(settings)
    setHasChanges(changed)
  }, [settings])

  // Update individual setting
  const updateSetting = <K extends keyof typeof DEFAULT_SETTINGS>(
    key: K,
    value: typeof DEFAULT_SETTINGS[K]
  ) => {
    setSettings((prev: typeof DEFAULT_SETTINGS) => ({ ...prev, [key]: value }))
  }

  // Save all settings
  const handleSave = () => {
    if (saveSettings(settings)) {
      setSaved(true)
      setHasChanges(false)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-white font-heading tracking-tight flex items-center gap-3">
            <SettingsIcon className="h-8 w-8 text-indigo-400" />
            Settings
          </h1>
          <p className="text-gray-400 mt-1">Manage your trading bot preferences</p>
        </div>
        
        {/* Save button */}
        <motion.button
          onClick={handleSave}
          disabled={!hasChanges && !saved}
          whileHover={{ scale: hasChanges ? 1.02 : 1 }}
          whileTap={{ scale: hasChanges ? 0.98 : 1 }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
            saved
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : hasChanges
              ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
              : 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-gray-700/50'
          }`}
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </motion.button>
      </motion.div>

      <div className="space-y-6">
        {/* Notifications */}
        <SettingsSection
          title="Notifications"
          description="Configure how you want to be notified about trading events"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                  <Bell className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Push Notifications</p>
                  <p className="text-sm text-gray-400">Get notified when rules are triggered</p>
                </div>
              </div>
              <Toggle 
                enabled={settings.notifications} 
                onChange={(v) => updateSetting('notifications', v)} 
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  {settings.sounds ? (
                    <Volume2 className="h-5 w-5 text-purple-400" />
                  ) : (
                    <VolumeX className="h-5 w-5 text-purple-400" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-white">Sound Alerts</p>
                  <p className="text-sm text-gray-400">Play sound when trades execute</p>
                </div>
              </div>
              <Toggle 
                enabled={settings.sounds} 
                onChange={(v) => updateSetting('sounds', v)} 
              />
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
                <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  {settings.darkMode ? (
                    <Moon className="h-5 w-5 text-amber-400" />
                  ) : (
                    <Sun className="h-5 w-5 text-amber-400" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-white">Dark Mode</p>
                  <p className="text-sm text-gray-400">Use dark theme (always on)</p>
                </div>
              </div>
              <Toggle 
                enabled={settings.darkMode} 
                onChange={(v) => updateSetting('darkMode', v)} 
                disabled={true}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                  <RefreshCw className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Auto Refresh</p>
                  <p className="text-sm text-gray-400">Automatically refresh price data</p>
                </div>
              </div>
              <Toggle 
                enabled={settings.autoRefresh} 
                onChange={(v) => updateSetting('autoRefresh', v)} 
              />
            </div>

            {settings.autoRefresh && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-14 mt-2"
              >
                <label className="text-sm text-gray-400 block mb-2">Refresh Interval</label>
                <select
                  value={settings.refreshInterval}
                  onChange={(e) => updateSetting('refreshInterval', e.target.value)}
                  className="bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 text-white cursor-pointer"
                >
                  <option value="3">3 seconds</option>
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                </select>
              </motion.div>
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
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <Shield className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Confirm Trades</p>
                  <p className="text-sm text-gray-400">Ask for confirmation before executing trades</p>
                </div>
              </div>
              <Toggle 
                enabled={settings.confirmTrades} 
                onChange={(v) => updateSetting('confirmTrades', v)} 
              />
            </div>
          </div>
        </SettingsSection>

        {/* Data Management */}
        <SettingsSection
          title="Data & Privacy"
          description="Manage your data and session"
        >
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-4 bg-gray-800/30 hover:bg-gray-800/50 rounded-xl transition-all duration-300 group border border-gray-700/30 hover:border-gray-600/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <Download className="h-5 w-5 text-blue-400" />
                </div>
                <span className="text-white font-medium">Export Trading Data</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear your session? This will log you out and reset all settings.')) {
                  localStorage.removeItem(SETTINGS_KEY)
                  logout()
                }
              }}
              className="w-full flex items-center justify-between p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-xl transition-all duration-300 text-red-400 group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                  <Trash2 className="h-5 w-5" />
                </div>
                <span className="font-medium">Clear Session Data</span>
              </div>
              <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </SettingsSection>

        {/* Wallet Info */}
        {wallet && (
          <SettingsSection title="Connected Wallet">
            <div className="bg-gray-800/30 rounded-xl p-4 border border-emerald-500/20">
              <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Public Key</p>
              <code className="text-sm text-emerald-400 break-all font-mono">{wallet.public_key}</code>
              <p className="text-xs text-gray-500 mt-4 flex items-center gap-2">
                <Shield className="h-3 w-3" />
                This is a devnet wallet for testing purposes only.
              </p>
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
