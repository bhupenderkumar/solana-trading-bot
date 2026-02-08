import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import RuleDetail from './pages/RuleDetail'
import Settings from './pages/Settings'
import TradeHistory from './pages/TradeHistory'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/rules/:id" element={<RuleDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/history" element={<TradeHistory />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
