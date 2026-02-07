import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  BarChart2,
  Info,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { pricesApi, HistoricalPriceData, PriceStatistics, OHLCData } from '../services/api'

type ChartType = 'line' | 'ohlc'
type TimeRange = 1 | 7 | 14 | 30 | 90 | 180 | 365

interface PriceChartProps {
  market?: string
  defaultDays?: number
  showStats?: boolean
  showOHLC?: boolean
  className?: string
}

export default function PriceChart({
  market = 'SOL-PERP',
  defaultDays = 20,
  showStats = true,
  showOHLC = true,
  className = '',
}: PriceChartProps) {
  const [days, setDays] = useState<TimeRange>(defaultDays as TimeRange)
  const [chartType, setChartType] = useState<ChartType>('line')
  const [selectedMarket, setSelectedMarket] = useState(market)

  const { data: historicalData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['historicalPrices', selectedMarket, days],
    queryFn: () => pricesApi.getHistoricalPrices(selectedMarket, days),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const { data: statistics, isLoading: loadingStats } = useQuery({
    queryKey: ['priceStatistics', selectedMarket, days],
    queryFn: () => pricesApi.getPriceStatistics(selectedMarket, days),
    enabled: showStats,
    staleTime: 5 * 60 * 1000,
  })

  const { data: ohlcData, isLoading: loadingOHLC } = useQuery({
    queryKey: ['ohlcData', selectedMarket, days],
    queryFn: () => pricesApi.getOHLCData(selectedMarket, days),
    enabled: showOHLC && chartType === 'ohlc',
    staleTime: 5 * 60 * 1000,
  })

  const { data: supportedMarkets } = useQuery({
    queryKey: ['supportedMarkets'],
    queryFn: pricesApi.getSupportedMarkets,
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 1, label: '24H' },
    { value: 7, label: '7D' },
    { value: 14, label: '14D' },
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 180, label: '6M' },
    { value: 365, label: '1Y' },
  ]

  const isLoading = loadingHistory || (showStats && loadingStats)

  return (
    <div className={`card bg-gradient-to-br from-dark-800 to-dark-800/50 rounded-2xl p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary-400" />
          <h3 className="text-lg font-semibold text-white">Historical Prices</h3>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Market Selector */}
          <div className="relative">
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="appearance-none bg-dark-700 text-white text-sm rounded-lg px-3 py-1.5 pr-8 border border-dark-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {supportedMarkets?.map((m) => (
                <option key={m.market} value={m.market}>
                  {m.market.replace('-PERP', '')}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400 pointer-events-none" />
          </div>

          {/* Chart Type Toggle */}
          {showOHLC && (
            <div className="flex bg-dark-700 rounded-lg p-0.5">
              <button
                onClick={() => setChartType('line')}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  chartType === 'line'
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-300 hover:text-white'
                }`}
              >
                Line
              </button>
              <button
                onClick={() => setChartType('ohlc')}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  chartType === 'ohlc'
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-300 hover:text-white'
                }`}
              >
                OHLC
              </button>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => refetchHistory()}
            className="p-1.5 text-dark-400 hover:text-white transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
        {timeRanges.map((range) => (
          <button
            key={range.value}
            onClick={() => setDays(range.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              days === range.value
                ? 'bg-primary-500 text-white'
                : 'bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-white'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Statistics Cards */}
      {showStats && statistics && (
        <StatisticsCards statistics={statistics} />
      )}

      {/* Chart */}
      <div className="mt-4">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : chartType === 'line' && historicalData ? (
          <LineChart data={historicalData} />
        ) : chartType === 'ohlc' && ohlcData ? (
          <OHLCChart data={ohlcData} />
        ) : (
          <div className="h-64 flex items-center justify-center text-dark-400">
            No data available
          </div>
        )}
      </div>

      {/* Footer */}
      {historicalData && (
        <div className="mt-4 flex items-center justify-between text-xs text-dark-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Last updated: {new Date(historicalData.fetched_at).toLocaleString()}
          </span>
          <span>Source: CoinGecko</span>
        </div>
      )}
    </div>
  )
}

function StatisticsCards({ statistics }: { statistics: PriceStatistics }) {
  const isPositive = statistics.price_change_percent >= 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="Current"
        value={`$${statistics.current_price.toLocaleString()}`}
        icon={<Activity className="h-4 w-4" />}
      />
      <StatCard
        label={`${statistics.days}D Change`}
        value={`${isPositive ? '+' : ''}${statistics.price_change_percent.toFixed(2)}%`}
        subValue={`${isPositive ? '+' : ''}$${statistics.price_change.toFixed(2)}`}
        icon={isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        valueClassName={isPositive ? 'text-success-400' : 'text-danger-400'}
      />
      <StatCard
        label="High"
        value={`$${statistics.high_price.toLocaleString()}`}
        icon={<TrendingUp className="h-4 w-4 text-success-400" />}
      />
      <StatCard
        label="Low"
        value={`$${statistics.low_price.toLocaleString()}`}
        icon={<TrendingDown className="h-4 w-4 text-danger-400" />}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  subValue,
  icon,
  valueClassName = '',
}: {
  label: string
  value: string
  subValue?: string
  icon?: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="bg-dark-900/50 rounded-xl p-3 border border-dark-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-dark-400">{icon}</span>}
        <span className="text-xs text-dark-400">{label}</span>
      </div>
      <p className={`text-sm font-semibold font-mono ${valueClassName || 'text-white'}`}>
        {value}
      </p>
      {subValue && (
        <p className={`text-xs ${valueClassName || 'text-dark-400'}`}>{subValue}</p>
      )}
    </div>
  )
}

function LineChart({ data }: { data: HistoricalPriceData }) {
  const { points, min, max, isUp } = useMemo(() => {
    const prices = data.prices.map((p) => p[1])
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const range = max - min || 1
    const height = 200
    const width = 100 // percentage

    const points = data.prices.map((p, i) => {
      const x = (i / (data.prices.length - 1)) * width
      const y = height - ((p[1] - min) / range) * height
      return { x, y, price: p[1], timestamp: p[0] }
    })

    const isUp = prices[prices.length - 1] >= prices[0]

    return { points, min, max, isUp }
  }, [data])

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPathD = `${pathD} L ${points[points.length - 1].x} 200 L ${points[0].x} 200 Z`

  return (
    <div className="relative h-64">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 200"
        preserveAspectRatio="none"
      >
        {/* Gradient fill */}
        <defs>
          <linearGradient id={`gradient-${isUp ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path
          d={areaPathD}
          fill={`url(#gradient-${isUp ? 'up' : 'down'})`}
        />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={isUp ? '#22c55e' : '#ef4444'}
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Price labels */}
      <div className="absolute right-0 top-0 text-xs text-dark-400 font-mono">
        ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div className="absolute right-0 bottom-0 text-xs text-dark-400 font-mono">
        ${min.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>

      {/* Date labels */}
      <div className="absolute left-0 bottom-0 text-xs text-dark-500">
        {new Date(data.prices[0][0]).toLocaleDateString()}
      </div>
      <div className="absolute right-0 bottom-6 text-xs text-dark-500">
        {new Date(data.prices[data.prices.length - 1][0]).toLocaleDateString()}
      </div>
    </div>
  )
}

function OHLCChart({ data }: { data: OHLCData }) {
  const { candles, min, max } = useMemo(() => {
    if (!data.ohlc.length) return { candles: [], min: 0, max: 0 }

    const prices = data.ohlc.flatMap((c) => [c.open, c.high, c.low, c.close])
    const min = Math.min(...prices)
    const max = Math.max(...prices)

    return { candles: data.ohlc, min, max }
  }, [data])

  if (!candles.length) {
    return (
      <div className="h-64 flex items-center justify-center text-dark-400">
        No OHLC data available
      </div>
    )
  }

  const range = max - min || 1
  const height = 200
  const candleWidth = 100 / candles.length

  return (
    <div className="relative h-64">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 200"
        preserveAspectRatio="none"
      >
        {candles.map((candle, i) => {
          const x = (i + 0.5) * candleWidth
          const isGreen = candle.close >= candle.open

          const highY = height - ((candle.high - min) / range) * height
          const lowY = height - ((candle.low - min) / range) * height
          const openY = height - ((candle.open - min) / range) * height
          const closeY = height - ((candle.close - min) / range) * height

          const bodyTop = Math.min(openY, closeY)
          const bodyHeight = Math.abs(openY - closeY) || 0.5

          return (
            <g key={i}>
              {/* Wick */}
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={isGreen ? '#22c55e' : '#ef4444'}
                strokeWidth="0.2"
                vectorEffect="non-scaling-stroke"
              />
              {/* Body */}
              <rect
                x={x - candleWidth * 0.3}
                y={bodyTop}
                width={candleWidth * 0.6}
                height={bodyHeight}
                fill={isGreen ? '#22c55e' : '#ef4444'}
              />
            </g>
          )
        })}
      </svg>

      {/* Price labels */}
      <div className="absolute right-0 top-0 text-xs text-dark-400 font-mono">
        ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div className="absolute right-0 bottom-0 text-xs text-dark-400 font-mono">
        ${min.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}

// Compact sparkline version for smaller displays
export function PriceSparkline({
  data,
  width = 100,
  height = 30,
  className = '',
}: {
  data: number[]
  width?: number
  height?: number
  className?: string
}) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')

  const isUp = data[data.length - 1] >= data[0]

  return (
    <svg width={width} height={height} className={className}>
      <polyline
        fill="none"
        stroke={isUp ? '#22c55e' : '#ef4444'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  )
}

// Mini card component for quick price overview with history
export function PriceOverviewCard({ market }: { market: string }) {
  const { data: priceData, isLoading } = useQuery({
    queryKey: ['priceWithHistory', market],
    queryFn: () => pricesApi.getCurrentPriceWithHistory(market),
    staleTime: 60 * 1000, // 1 minute
  })

  if (isLoading || !priceData) {
    return (
      <div className="bg-dark-800 rounded-xl p-4 animate-pulse">
        <div className="h-4 w-16 bg-dark-700 rounded mb-2"></div>
        <div className="h-6 w-24 bg-dark-700 rounded"></div>
      </div>
    )
  }

  const isPositive = (priceData.price_change_percentage_24h ?? 0) >= 0

  return (
    <div className="bg-dark-800 rounded-xl p-4 border border-dark-700/50 hover:border-dark-600 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-dark-300">
          {priceData.name || market.replace('-PERP', '')}
        </span>
        <span className="text-xs text-dark-500">{priceData.symbol}</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xl font-bold font-mono text-white">
            ${priceData.current_price?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p
            className={`text-sm flex items-center gap-1 ${
              isPositive ? 'text-success-400' : 'text-danger-400'
            }`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isPositive ? '+' : ''}
            {priceData.price_change_percentage_24h?.toFixed(2)}%
          </p>
        </div>

        {priceData.sparkline_7d && priceData.sparkline_7d.length > 0 && (
          <PriceSparkline data={priceData.sparkline_7d} width={60} height={24} />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-dark-500">24h High</span>
          <p className="text-dark-300 font-mono">
            ${priceData.high_24h?.toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-dark-500">24h Low</span>
          <p className="text-dark-300 font-mono">
            ${priceData.low_24h?.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
