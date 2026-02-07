# Solana Trading Bot

An automated trading system for Solana DeFi markets. Input trading rules in natural language, and the system creates automated jobs that monitor conditions and execute trades on Drift Protocol.

## Features

- **Natural Language Input**: Describe your trading conditions in plain English
- **LLM-Powered Parsing**: AI agent converts your rules into executable trading logic
- **Automated Cron Jobs**: Continuously monitor prices and execute trades
- **Docker Persistence**: Jobs survive restarts and automatically resume
- **Real-time Updates**: WebSocket notifications for trade executions
- **Drift Protocol Integration**: Trade perpetuals/futures on Solana

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Solana wallet with SOL for trading
- Drift Protocol account (will be created on first use)
- OpenAI API key or Anthropic API key

### 1. Clone and Setup

```bash
cd ~/solana-trading-bot

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### 2. Configure Environment

Edit `.env` file:

```bash
# Required
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
WALLET_PRIVATE_KEY=your_base58_private_key
OPENAI_API_KEY=sk-xxx  # or use ANTHROPIC_API_KEY

# Optional - defaults shown
DRIFT_ENV=mainnet
DATABASE_URL=postgresql://trading:trading@postgres:5432/trading
CHECK_INTERVAL_SECONDS=10
```

### 3. Start with Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## Usage Examples

### Example 1: Stop Loss

Input:
```
If SOL-PERP price drops $5 from my entry price, close my entire position
```

### Example 2: Take Profit

Input:
```
When BTC-PERP reaches $100,000, sell 50% of my position
```

### Example 3: Conditional Buy

Input:
```
If ETH-PERP goes below $3000, open a long position with $500
```

### Example 4: Multi-condition

Input:
```
Monitor SOL-PERP:
- If it drops 5%, sell half my position
- If it drops 10%, close everything
- If it rises 10%, take profit on 25%
```

## Project Structure

```
solana-trading-bot/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI routes
│   │   ├── services/      # Business logic
│   │   ├── models/        # Database models
│   │   ├── agents/        # LLM agent code
│   │   └── jobs/          # Cron job definitions
│   ├── tests/
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── hooks/         # Custom hooks
│   ├── public/
│   └── package.json
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
└── README.md
```

## Development Setup

### Backend (without Docker)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start server
uvicorn main:app --reload --port 8000
```

### Frontend (without Docker)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## API Reference

### Create Trading Rule

```bash
curl -X POST http://localhost:8000/api/rules \
  -H "Content-Type: application/json" \
  -d '{"input": "If SOL-PERP drops $5, sell everything"}'
```

### List Rules

```bash
curl http://localhost:8000/api/rules
```

### Get Current Prices

```bash
curl http://localhost:8000/api/prices
```

### Toggle Rule On/Off

```bash
curl -X POST http://localhost:8000/api/rules/{rule_id}/toggle
```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | Solana RPC endpoint | Required |
| `WALLET_PRIVATE_KEY` | Base58 encoded private key | Required |
| `DRIFT_ENV` | `mainnet` or `devnet` | `devnet` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `CHECK_INTERVAL_SECONDS` | How often to check conditions | `10` |
| `DATABASE_URL` | PostgreSQL connection string | Docker default |
| `LOG_LEVEL` | Logging verbosity | `INFO` |

## Supported Markets (Drift Protocol)

- SOL-PERP (Solana perpetual)
- BTC-PERP (Bitcoin perpetual)
- ETH-PERP (Ethereum perpetual)
- And 20+ more perpetual markets

## Safety Features

- **Simulation Mode**: Test rules without executing trades
- **Position Limits**: Configure maximum position sizes
- **Daily Loss Limits**: Stop trading after max daily loss
- **Confirmation Prompts**: Optional confirmation for large trades
- **Audit Logs**: Complete history of all actions

## Troubleshooting

### Jobs not running after restart

```bash
# Check scheduler logs
docker-compose logs scheduler

# Verify database connection
docker-compose exec postgres psql -U trading -c "SELECT * FROM jobs;"
```

### Connection to Drift failing

```bash
# Test RPC connection
curl your_rpc_url -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Check if using correct network (mainnet/devnet)
```

### LLM parsing errors

- Ensure your API key is valid
- Check that your input is clear and specific
- Review parsed rules before enabling

## Risk Disclaimer

**IMPORTANT**: This software is for educational purposes. Trading cryptocurrencies and derivatives involves substantial risk of loss. Only trade with funds you can afford to lose. The authors are not responsible for any financial losses incurred.

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please read CONTRIBUTING.md first.

## Support

- GitHub Issues: Report bugs or request features
- Documentation: See `/docs` folder
