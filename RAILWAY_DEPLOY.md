# Solana Trading Bot - Railway Deployment

This project requires **two separate Railway services**:

## Quick Deploy

### 1. Backend Service
1. In Railway, click "New Service" → "GitHub Repo"
2. Select this repo
3. **Set Root Directory**: `backend`
4. Add environment variables (see below)

### 2. Frontend Service  
1. In Railway, click "New Service" → "GitHub Repo"
2. Select this repo
3. **Set Root Directory**: `frontend`
4. Add environment variable:
   - `VITE_API_URL` = `https://your-backend-service.railway.app/api`

### 3. PostgreSQL Database
1. Click "New Service" → "Database" → "PostgreSQL"
2. Copy the `DATABASE_URL` to backend environment variables

## Backend Environment Variables

```
DATABASE_URL=<from Railway PostgreSQL>
SOLANA_RPC_URL=https://api.devnet.solana.com
DRIFT_ENV=devnet

# Choose ONE LLM option:

# Option 1: Groq (Recommended - fast & free)
USE_GROQ=true
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile

# Option 2: OpenAI
# OPENAI_API_KEY=your-openai-key
```

## Frontend Environment Variables

```
VITE_API_URL=https://your-backend-url.railway.app/api
```
