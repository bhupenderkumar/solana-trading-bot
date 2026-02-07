# Solana Trading Bot - Architecture Documentation

## Overview

This is an automated trading system for Solana DeFi markets (primarily Drift Protocol for perpetuals/futures). Users can input trading conditions in natural language, which are processed by an LLM agent to create automated cron jobs that monitor prices and execute trades.

## System Architecture

```
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|    Frontend      |---->|    Backend API    |---->|   LLM Agent      |
|    (React)       |     |    (FastAPI)      |     |   (OpenAI/Claude)|
|                  |     |                   |     |                  |
+------------------+     +-------------------+     +------------------+
                                |
                                |
                    +-----------+-----------+
                    |                       |
                    v                       v
          +------------------+    +------------------+
          |                  |    |                  |
          |   Job Scheduler  |    |   PostgreSQL     |
          |   (APScheduler)  |    |   Database       |
          |                  |    |                  |
          +------------------+    +------------------+
                    |
                    v
          +------------------+
          |                  |
          |  Drift Protocol  |
          |  (Solana DEX)    |
          |                  |
          +------------------+
```

## Components

### 1. Frontend (React/TypeScript)

**Purpose**: User interface for creating and managing trading rules.

**Features**:
- Natural language input for trading conditions
- Dashboard showing active trading jobs
- Real-time status updates via WebSocket
- Trade history and logs
- Wallet connection (Phantom/Solflare)

**Tech Stack**:
- React 18 with TypeScript
- TailwindCSS for styling
- React Query for state management
- WebSocket for real-time updates

### 2. Backend API (Python/FastAPI)

**Purpose**: Core application server handling business logic.

**Features**:
- REST API endpoints for CRUD operations on trading rules
- WebSocket server for real-time updates
- Integration with LLM agents
- Job scheduling management
- Solana wallet integration

**Tech Stack**:
- FastAPI (async web framework)
- SQLAlchemy (ORM)
- APScheduler (job scheduling)
- Pydantic (data validation)

**API Endpoints**:
```
POST   /api/rules          - Create new trading rule (natural language input)
GET    /api/rules          - List all trading rules
GET    /api/rules/{id}     - Get specific trading rule
DELETE /api/rules/{id}     - Delete trading rule
PUT    /api/rules/{id}     - Update trading rule
POST   /api/rules/{id}/toggle - Enable/disable rule

GET    /api/jobs           - List all active jobs
GET    /api/jobs/{id}/logs - Get job execution logs

GET    /api/prices         - Get current market prices
GET    /api/positions      - Get current positions

WebSocket /ws              - Real-time updates
```

### 3. LLM Agent Service

**Purpose**: Parse natural language trading instructions into structured rules.

**Features**:
- Natural language understanding
- Trading rule extraction
- Validation of trading parameters
- Generate human-readable summaries

**Input Example**:
```
"If SOL-PERP price drops 0.1 from current price, sell 50% of my position.
 If it goes up by 0.2, take profit on the entire position."
```

**Output Example**:
```json
{
  "rules": [
    {
      "condition": {
        "type": "price_change",
        "market": "SOL-PERP",
        "direction": "down",
        "threshold": 0.1,
        "reference": "current_price"
      },
      "action": {
        "type": "sell",
        "market": "SOL-PERP",
        "amount_percent": 50
      }
    },
    {
      "condition": {
        "type": "price_change",
        "market": "SOL-PERP",
        "direction": "up",
        "threshold": 0.2,
        "reference": "current_price"
      },
      "action": {
        "type": "sell",
        "market": "SOL-PERP",
        "amount_percent": 100
      }
    }
  ]
}
```

### 4. Job Scheduler (APScheduler)

**Purpose**: Manage and execute cron jobs for monitoring conditions.

**Features**:
- Persistent job storage (survives restarts)
- Configurable check intervals
- Job state management
- Retry logic with exponential backoff
- Dead letter queue for failed jobs

**Job Types**:
- `PriceMonitorJob`: Monitors price conditions
- `PositionMonitorJob`: Monitors position changes
- `TimeBasedJob`: Executes at specific times

### 5. Drift Protocol Integration

**Purpose**: Execute trades on Solana's Drift Protocol.

**Features**:
- Real-time price feeds
- Order placement (market, limit, trigger)
- Position management
- Account balance queries
- Transaction monitoring

**SDK**: `driftpy` (Python SDK for Drift Protocol)

### 6. Database (PostgreSQL)

**Purpose**: Persistent storage for all application data.

**Tables**:
- `users`: User accounts and wallet addresses
- `trading_rules`: Parsed trading rules
- `jobs`: Scheduled jobs with state
- `job_logs`: Execution logs
- `trades`: Executed trade history
- `price_snapshots`: Historical price data

### 7. Docker Infrastructure

**Services**:
- `api`: FastAPI backend
- `scheduler`: APScheduler worker
- `postgres`: PostgreSQL database
- `redis`: Cache and job queue (optional)
- `frontend`: React app (nginx)

## Data Flow

### Creating a Trading Rule

1. User enters natural language rule in frontend
2. Frontend sends POST to `/api/rules`
3. Backend calls LLM Agent to parse the rule
4. LLM returns structured rule definition
5. Backend validates and stores rule in DB
6. Backend creates cron job in scheduler
7. Response sent to frontend with rule ID

### Job Execution

1. Scheduler triggers job at configured interval (e.g., every 10 seconds)
2. Job fetches current price from Drift Protocol
3. Job evaluates conditions against stored rules
4. If condition met:
   a. Execute trade via Drift SDK
   b. Log execution result
   c. Update job state
   d. Send WebSocket notification to frontend
5. If condition not met:
   a. Log check result
   b. Continue monitoring

### System Recovery (Docker Restart)

1. Docker containers start
2. Backend loads job states from PostgreSQL
3. APScheduler restores jobs from persistent store
4. Jobs resume monitoring from last known state
5. WebSocket connections re-established by frontend

## Security Considerations

### Wallet Security
- Private keys stored encrypted
- Support for hardware wallet signing
- Transaction simulation before execution

### API Security
- JWT authentication
- Rate limiting
- Input validation
- CORS configuration

### Infrastructure Security
- Docker secrets for credentials
- Network isolation
- TLS for all connections

## Configuration

### Environment Variables

```bash
# Backend
DATABASE_URL=postgresql://user:pass@postgres:5432/trading
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
DRIFT_ENV=mainnet  # or devnet for testing
OPENAI_API_KEY=sk-xxx  # or ANTHROPIC_API_KEY
WALLET_PRIVATE_KEY=xxx  # encrypted

# Frontend
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WS_URL=ws://localhost:8000/ws
```

## Monitoring & Observability

- **Logging**: Structured JSON logs with correlation IDs
- **Metrics**: Prometheus metrics endpoint
- **Alerts**: Configurable alerts for failed jobs
- **Health Checks**: `/health` endpoint for Docker

## Future Enhancements

1. **Multi-exchange Support**: Add Jupiter, Orca, Raydium
2. **Advanced Strategies**: Grid trading, DCA, trailing stops
3. **Backtesting**: Test strategies against historical data
4. **Mobile App**: React Native companion app
5. **Social Trading**: Copy trading from successful traders
