import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Settings,
  History,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  MessageSquare
} from 'lucide-react'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation()

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/chat', icon: MessageSquare, label: 'Chat' },
    { path: '/rules', icon: Target, label: 'All Rules' },
    { path: '/history', icon: History, label: 'Trade History' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-56'} bg-gray-800/50 border-r border-gray-700 flex flex-col transition-all duration-300`}>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 bg-gray-800 border border-gray-700 rounded-full p-1 hover:bg-gray-700 transition-colors z-10"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path === '/rules' && location.pathname.startsWith('/rules/'))

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive: navActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                    ${isActive || navActive
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'text-gray-400 hover:bg-gray-700/50 hover:text-white border border-transparent'
                    }
                  `}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Help section */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-700">
          <a
            href="#"
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            Help & Docs
          </a>
        </div>
      )}
    </aside>
  )
}
