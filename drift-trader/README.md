# Drift Trader Microservice

A standalone microservice for executing trades on Drift Protocol (Solana).

## Why a Separate Service?

The `driftpy` Python SDK has specific dependency requirements that conflict with the main FastAPI backend (typing-extensions, cffi versions). This microservice runs in an isolated environment with its own Python dependencies.

## Architecture

```
┌─────────────────┐      HTTP       ┌──────────────────┐      Solana      ┌──────────────┐
│  Main Backend   │ ─────────────→ │   Drift Trader   │ ───────────────→ │ Drift Protocol│
│  (FastAPI)      │    :8101       │   (FastAPI)      │                  │   (Devnet)    │
│  Port 8100      │                │   Port 8101      │                  │               │
└─────────────────┘                └──────────────────┘                  └──────────────┘
        │                                   │
        │                                   │
        └── Rules/Scheduler ──────────────→┘
             When condition met,
             calls /trade endpoint
```

## Setup

### 1. Create Virtual Environment

```bash
cd drift-trader
python3.9 -m venv venv  # Python 3.9 recommended for driftpy
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your wallet private key
```

**Important**: Use the same wallet private key as your Phantom/Solflare browser wallet if you want to manage positions from both places.

### 3. Run the Service

```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8101 --reload
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/markets` | List available markets |
| POST | `/trade` | Execute a trade |
| POST | `/close` | Close a position |
| GET | `/positions` | Get all positions |
| GET | `/position/{market}` | Get position for specific market |
| GET | `/account` | Get account info |

### Example: Place a Trade

```bash
curl -X POST http://localhost:8101/trade \
  -H "Content-Type: application/json" \
  -d '{
    "market": "SOL-PERP",
    "side": "buy",
    "size": 0.1,
    "order_type": "market"
  }'
```

Response:
```json
{
  "success": true,
  "signature": "5Kp3...",
  "explorer_url": "https://explorer.solana.com/tx/5Kp3...?cluster=devnet",
  "message": "Order placed: BUY 0.1 SOL-PERP",
  "details": {
    "market": "SOL-PERP",
    "market_index": 0,
    "side": "buy",
    "size": 0.1,
    "order_type": "market",
    "network": "devnet"
  }
}
```

## Docker

Build and run:
```bash
docker build -t drift-trader .
docker run -p 8101:8101 --env-file .env drift-trader
```

Or use docker-compose from root:
```bash
docker-compose up drift-trader
```

## Verifying Trades

After a successful trade, you can verify it:

1. **Solana Explorer**: Use the `explorer_url` from the response
2. **Drift App**: https://app.drift.trade/?network=devnet (connect same wallet)

## Security Notes

- Never commit `.env` file with private keys
- The wallet private key is used to sign ALL trades
- Consider using a dedicated trading wallet with limited funds
- This is for DEVNET testing - use extreme caution on mainnet
