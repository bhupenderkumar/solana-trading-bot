# Solana Trading Bot - Railway Deployment

This project requires **two separate Railway services**:

## Automatic Deployment (GitHub Integration)

Railway automatically deploys when you push to GitHub. There are two options:

### Option 1: Native Railway GitHub Integration (Recommended)
1. Go to your Railway project dashboard
2. Click on each service (backend, frontend)
3. Go to **Settings** → **Source**
4. Click **Connect GitHub Repo** and select `bhupenderkumar/solana-trading-bot`
5. Set **Root Directory**:
   - For backend service: `backend`
   - For frontend service: `frontend`
6. Set **Watch Paths** (optional): Only trigger deploys when specific directories change
7. Railway will now auto-deploy whenever you push to `main`

### Option 2: GitHub Actions Deployment
If you prefer more control, use the GitHub Actions workflow:

1. **Generate a Railway Token:**
   - Go to [Railway Dashboard](https://railway.app/account/tokens)
   - Click **Create Token**
   - Copy the token

2. **Add to GitHub Secrets:**
   - Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `RAILWAY_TOKEN`
   - Value: Your Railway token

3. **Push to deploy:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

The workflow at `.github/workflows/railway-deploy.yml` will automatically deploy both backend and frontend services.

---

## Manual Deploy (First Time Setup)

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
