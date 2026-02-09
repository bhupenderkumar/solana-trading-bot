import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import RuleDetail from './pages/RuleDetail'
import Settings from './pages/Settings'
import TradeHistory from './pages/TradeHistory'
import Landing from './pages/Landing'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'

function AppContent() {
  const location = useLocation()
  const isLandingPage = location.pathname === '/'

  if (isLandingPage) {
    return <Landing />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/rules/:id" element={<RuleDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/history" element={<TradeHistory />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
