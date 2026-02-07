import { useState } from 'react'
import { Search, Filter, X, ChevronDown } from 'lucide-react'

interface SearchFilterProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  statusFilter: string | null
  onStatusFilterChange: (status: string | null) => void
  marketFilter: string | null
  onMarketFilterChange: (market: string | null) => void
  markets: string[]
}

export default function SearchFilter({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  marketFilter,
  onMarketFilterChange,
  markets
}: SearchFilterProps) {
  const [showFilters, setShowFilters] = useState(false)

  const statuses = [
    { value: 'active', label: 'Active', color: 'green' },
    { value: 'paused', label: 'Paused', color: 'yellow' },
    { value: 'triggered', label: 'Triggered', color: 'blue' },
    { value: 'expired', label: 'Expired', color: 'gray' },
  ]

  const hasActiveFilters = statusFilter || marketFilter || searchQuery

  return (
    <div className="mb-6 space-y-3">
      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search rules by content, market, or condition..."
            className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 placeholder-dark-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
            showFilters || hasActiveFilters
              ? 'bg-primary-500/20 border-primary-500/30 text-primary-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:text-white hover:border-dark-600'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-primary-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
              {[statusFilter, marketFilter, searchQuery].filter(Boolean).length}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filter Options */}
      {showFilters && (
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4 animate-fade-in">
          <div className="flex flex-wrap gap-6">
            {/* Status Filter */}
            <div>
              <label className="text-xs text-dark-400 uppercase tracking-wide mb-2 block font-medium">
                Status
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onStatusFilterChange(null)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    !statusFilter
                      ? 'bg-dark-700 text-white'
                      : 'bg-dark-800 text-dark-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {statuses.map(status => (
                  <button
                    key={status.value}
                    onClick={() => onStatusFilterChange(statusFilter === status.value ? null : status.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      statusFilter === status.value
                        ? status.color === 'green' ? 'bg-success-500/20 text-success-400 border border-success-500/30'
                        : status.color === 'yellow' ? 'bg-warning-500/20 text-warning-400 border border-warning-500/30'
                        : status.color === 'blue' ? 'bg-info-500/20 text-info-400 border border-info-500/30'
                        : 'bg-dark-600/30 text-dark-400 border border-dark-600/50'
                        : 'bg-dark-800 text-dark-400 hover:text-white'
                    }`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Market Filter */}
            <div>
              <label className="text-xs text-dark-400 uppercase tracking-wide mb-2 block font-medium">
                Market
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onMarketFilterChange(null)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    !marketFilter
                      ? 'bg-dark-700 text-white'
                      : 'bg-dark-800 text-dark-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {markets.map(market => (
                  <button
                    key={market}
                    onClick={() => onMarketFilterChange(marketFilter === market ? null : market)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      marketFilter === market
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                        : 'bg-dark-800 text-dark-400 hover:text-white'
                    }`}
                  >
                    {market.replace('-PERP', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                onSearchChange('')
                onStatusFilterChange(null)
                onMarketFilterChange(null)
              }}
              className="mt-4 text-sm text-dark-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
