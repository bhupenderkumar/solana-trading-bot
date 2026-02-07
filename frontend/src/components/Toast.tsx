import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast = { ...toast, id }

    setToasts(prev => [...prev, newToast])

    setTimeout(() => {
      removeToast(id)
    }, toast.duration || 4000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const success = useCallback((title: string, message?: string) => {
    addToast({ type: 'success', title, message })
  }, [addToast])

  const error = useCallback((title: string, message?: string) => {
    addToast({ type: 'error', title, message, duration: 6000 })
  }, [addToast])

  const warning = useCallback((title: string, message?: string) => {
    addToast({ type: 'warning', title, message })
  }, [addToast])

  const info = useCallback((title: string, message?: string) => {
    addToast({ type: 'info', title, message })
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast, onClose: () => void }) {
  const config = {
    success: {
      icon: <CheckCircle className="h-5 w-5 text-success-400" />,
      bg: 'bg-success-500/10 border-success-500/30',
      glow: 'shadow-[0_0_20px_rgba(34,197,94,0.15)]',
    },
    error: {
      icon: <XCircle className="h-5 w-5 text-danger-400" />,
      bg: 'bg-danger-500/10 border-danger-500/30',
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
    },
    warning: {
      icon: <AlertTriangle className="h-5 w-5 text-warning-400" />,
      bg: 'bg-warning-500/10 border-warning-500/30',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    },
    info: {
      icon: <Info className="h-5 w-5 text-info-400" />,
      bg: 'bg-info-500/10 border-info-500/30',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.15)]',
    },
  }

  const { icon, bg, glow } = config[toast.type]

  return (
    <div
      className={`${bg} ${glow} border rounded-xl p-4 backdrop-blur-xl animate-slide-in-right flex items-start gap-3 pointer-events-auto`}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white">{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-dark-300 mt-0.5 line-clamp-2">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-dark-400 hover:text-white transition-colors p-1 hover:bg-dark-700/50 rounded-lg"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
