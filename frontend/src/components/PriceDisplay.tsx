import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { pricesApi, Prices } from '../services/api'
import { PriceDisplaySkeleton } from './Skeleton'

interface PriceHistory {
  [market: string]: number[]
}

interface PriceChange {
  [market: string]: {
    change: number
    percentChange: number
  }
}

export default function PriceDisplay() {
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({})
  const [priceChanges, setPriceChanges] = useState<PriceChange>({})
  const previousPrices = useRef<Prices | null>(null)

  const { data: prices, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['prices'],
    queryFn: pricesApi.getAll,
    refetchInterval: 3000,
  })

  useEffect(() => {
    if (prices) {
      // Update history
      setPriceHistory(prev => {
        const updated: PriceHistory = { ...prev }
        Object.entries(prices).forEach(([market, price]) => {
          if (!updated[market]) {
            updated[market] = []
          }
          updated[market] = [...updated[market].slice(-19), price]
        })
        return updated
      })

      // Calculate changes
      if (previousPrices.current) {
        const changes: PriceChange = {}
        Object.entries(prices).forEach(([market, price]) => {
          const prevPrice = previousPrices.current?.[market]
          if (prevPrice) {
            const change = price - prevPrice
            const percentChange = (change / prevPrice) * 100
            changes[market] = { change, percentChange }
          }
        })
        setPriceChanges(changes)
      }

      previousPrices.current = prices
    }
  }, [prices])

  if (isLoading) {
    return <PriceDisplaySkeleton />
  }

  if (!prices || Object.keys(prices).length === 0) {
    return null
  }

  return (
    <div className="card bg-gradient-to-br from-dark-800 to-dark-800/50 rounded-2xl p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-dark-400 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500"></span>
          </span>
          Live Market Prices
        </h3>
        <span className="text-xs text-dark-500">
          Updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(prices).map(([market, price]) => (
          <PriceCard
            key={market}
            market={market}
            price={price}
            change={priceChanges[market]}
            history={priceHistory[market] || []}
          />
        ))}
      </div>
    </div>
  )
}

interface PriceCardProps {
  market: string
  price: number
  change?: { change: number; percentChange: number }
  history: number[]
}

function PriceCard({ market, price, change, history }: PriceCardProps) {
  const isUp = change ? change.change > 0 : undefined
  const isDown = change ? change.change < 0 : undefined

  return (
    <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50 hover:border-dark-600 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-dark-400 font-medium">
          {market.replace('-PERP', '')}
        </span>
        {change && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${
            isUp ? 'text-success-400' : isDown ? 'text-danger-400' : 'text-dark-400'
          }`}>
            {isUp ? <TrendingUp className="h-3 w-3" /> :
             isDown ? <TrendingDown className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
            {change.percentChange.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className={`text-xl font-bold font-mono transition-colors ${
            isUp ? 'text-success-400' : isDown ? 'text-danger-400' : 'text-white'
          }`}>
            ${price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
          {change && (
            <p className={`text-xs ${isUp ? 'text-success-400/70' : isDown ? 'text-danger-400/70' : 'text-dark-500'}`}>
              {isUp ? '+' : ''}{change.change.toFixed(2)}
            </p>
          )}
        </div>

        {/* Mini sparkline */}
        {history.length > 1 && (
          <MiniSparkline data={history} />
        )}
      </div>
    </div>
  )
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const height = 24
  const width = 50

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  const isUp = data[data.length - 1] >= data[0]

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke={isUp ? '#22c55e' : '#ef4444'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  )
}
