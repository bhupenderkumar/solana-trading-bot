import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, Wallet } from '../services/api'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  wallet: { public_key: string; created_at: string } | null
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: () => Promise<void>
  logout: () => void
  createWallet: () => Promise<Wallet>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    wallet: null,
    isLoading: true,
  })

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check for existing token
        const existingToken = authApi.getToken()
        const savedWallet = authApi.getSavedWallet()

        if (existingToken) {
          // Validate token
          const { valid } = await authApi.validateToken()
          if (valid) {
            setState({
              isAuthenticated: true,
              token: existingToken,
              wallet: savedWallet,
              isLoading: false,
            })
            return
          }
        }

        // No valid token, create new one automatically
        const result = await authApi.getOrCreateToken()
        setState({
          isAuthenticated: true,
          token: result.token,
          wallet: savedWallet,
          isLoading: false,
        })
      } catch (error) {
        console.error('Auth initialization error:', error)
        setState(prev => ({ ...prev, isLoading: false }))
      }
    }

    initAuth()
  }, [])

  const login = async () => {
    const result = await authApi.getOrCreateToken()
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
      token: result.token,
    }))
  }

  const logout = () => {
    authApi.clearToken()
    setState({
      isAuthenticated: false,
      token: null,
      wallet: null,
      isLoading: false,
    })
  }

  const createWallet = async (): Promise<Wallet> => {
    const wallet = await authApi.createWallet()
    setState(prev => ({
      ...prev,
      wallet: { public_key: wallet.public_key, created_at: new Date().toISOString() },
    }))

    // Link wallet to token
    if (state.token) {
      try {
        await authApi.linkWallet(wallet.public_key)
      } catch (e) {
        console.error('Failed to link wallet:', e)
      }
    }

    return wallet
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, createWallet }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
