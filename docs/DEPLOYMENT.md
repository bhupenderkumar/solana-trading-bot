# Deployment Guide

This guide explains how to deploy the Solana Trading Bot to AWS EC2 with automatic CI/CD using GitHub Actions.

## Prerequisites

- AWS EC2 instance (Ubuntu 22.04 or later recommended)
- GitHub repository with this code
- Domain name (optional, for HTTPS)

## Quick Start

### 1. Launch EC2 Instance

**Recommended specs:**
- Instance type: `t3.small` or larger
- Storage: 20GB minimum
- OS: Ubuntu 22.04 LTS

**Security Group Rules:**
| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

### 2. SSH into EC2 and Run Setup

```bash
# Download and run the setup script
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/solana-trading-bot/main/scripts/ec2-setup.sh | bash

# Or manually:
chmod +x scripts/ec2-setup.sh
./scripts/ec2-setup.sh
```

### 3. Clone Repository

```bash
cd /opt/solana-trading-bot
git clone https://github.com/YOUR_USERNAME/solana-trading-bot.git .
```

### 4. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your secrets
nano .env
```

**Required environment variables:**

```bash
# Database (uses PostgreSQL from docker-compose)
DATABASE_URL=postgresql+asyncpg://trading:trading@postgres:5432/trading

# Solana RPC (get free tier from Helius or QuickNode)
SOLANA_RPC_URL=https://api.devnet.solana.com
DRIFT_ENV=devnet

# Wallet (NEVER commit this!)
WALLET_PRIVATE_KEY=your_base58_private_key

# LLM (choose one)
# Option 1: OpenAI
OPENAI_API_KEY=sk-...

# Option 2: Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Option 3: GitHub Models (free!)
USE_GITHUB_PROXY=true
GITHUB_TOKEN=ghp_...
LLM_MODEL=claude-3.5-sonnet
```

### 5. Deploy

```bash
# Run deployment
./scripts/deploy.sh

# Or manually with docker-compose
docker-compose up -d
```

---

## GitHub Actions CI/CD Setup

The CI/CD pipeline automatically deploys when you push to `main` branch.

### Step 1: Add SSH Key to EC2

```bash
# On your local machine, generate a deploy key
ssh-keygen -t ed25519 -f ~/.ssh/solana-trading-bot-deploy -N ""

# Copy the public key to EC2
ssh-copy-id -i ~/.ssh/solana-trading-bot-deploy.pub ubuntu@YOUR_EC2_IP

# Verify SSH access
ssh -i ~/.ssh/solana-trading-bot-deploy ubuntu@YOUR_EC2_IP
```

### Step 2: Add GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions

Add these **Repository Secrets**:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `EC2_HOST` | EC2 public IP or DNS | `54.123.45.67` |
| `EC2_USER` | SSH username | `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | Private key content | Contents of `~/.ssh/solana-trading-bot-deploy` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql+asyncpg://trading:trading@postgres:5432/trading` |
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `DRIFT_ENV` | Drift environment | `devnet` |
| `WALLET_PRIVATE_KEY` | Wallet private key | Base58 encoded key |
| `OPENAI_API_KEY` | OpenAI API key (optional) | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional) | `sk-ant-...` |
| `USE_GITHUB_PROXY` | Use GitHub Models | `true` |
| `GITHUB_TOKEN_LLM` | GitHub token for LLM | `ghp_...` |
| `LLM_MODEL` | LLM model to use | `claude-3.5-sonnet` |
| `CHECK_INTERVAL_SECONDS` | Price check interval | `10` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `APP_SECRET_KEY` | Application secret | Random 32+ char string |

### Step 3: Push to Deploy

```bash
git add .
git commit -m "Setup CI/CD"
git push origin main
```

The workflow will:
1. Run tests
2. SSH to EC2
3. Pull latest code
4. Build Docker images
5. Deploy containers
6. Run database migrations
7. Verify health check

---

## Manual Deployment

If you prefer not to use CI/CD:

```bash
# SSH to EC2
ssh ubuntu@YOUR_EC2_IP

# Navigate to app directory
cd /opt/solana-trading-bot

# Pull latest changes
git pull origin main

# Deploy
./scripts/deploy.sh
```

---

## HTTPS Setup (Optional)

For production, enable HTTPS with Let's Encrypt:

```bash
# Install certbot (already done in setup script)
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

---

## Monitoring & Logs

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Check Status

```bash
# Container status
docker-compose ps

# System resources
htop

# Disk usage
df -h
```

### Health Check

```bash
# API health
curl http://localhost:8000/health

# From outside (replace with your IP)
curl http://YOUR_EC2_IP/health
```

---

## Troubleshooting

### Common Issues

**1. Container won't start**
```bash
docker-compose logs api
# Check for missing env vars or connection issues
```

**2. Database connection failed**
```bash
# Check if postgres is running
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres
```

**3. Port already in use**
```bash
# Find what's using the port
sudo lsof -i :8000
sudo lsof -i :3000

# Kill the process or change ports
```

**4. Permission denied**
```bash
# Fix Docker permissions
sudo usermod -aG docker $USER
newgrp docker
```

**5. Out of disk space**
```bash
# Clean Docker
docker system prune -a -f

# Check disk
df -h
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart api

# Full rebuild
docker-compose down
docker-compose up -d --build
```

---

## Security Best Practices

1. **Never commit `.env` file** - It's in `.gitignore`
2. **Use separate wallets** - Trading wallet should have limited funds
3. **Regular updates** - `sudo apt update && sudo apt upgrade`
4. **Monitor logs** - Check for suspicious activity
5. **Backup database** - Regular PostgreSQL backups
6. **Rotate secrets** - Change API keys periodically

### Database Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U trading trading > backup.sql

# Restore
docker-compose exec -T postgres psql -U trading trading < backup.sql
```

---

## Architecture

```
                    ┌─────────────────┐
                    │   GitHub Repo   │
                    └────────┬────────┘
                             │ push
                             ▼
                    ┌─────────────────┐
                    │ GitHub Actions  │
                    │   (CI/CD)       │
                    └────────┬────────┘
                             │ SSH deploy
                             ▼
┌──────────────────────────────────────────────────┐
│                    EC2 Instance                    │
│  ┌────────────────────────────────────────────┐  │
│  │                   nginx                      │  │
│  │              (reverse proxy)                 │  │
│  │         :80 -> :3000 (frontend)             │  │
│  │         :80/api -> :8000 (backend)          │  │
│  └────────────────┬───────────────────────────┘  │
│                   │                               │
│    ┌──────────────┴──────────────┐               │
│    │                             │               │
│    ▼                             ▼               │
│  ┌─────────────┐           ┌─────────────┐      │
│  │  Frontend   │           │   Backend   │      │
│  │  (React)    │           │  (FastAPI)  │      │
│  │   :3000     │           │   :8000     │      │
│  └─────────────┘           └──────┬──────┘      │
│                                   │              │
│                                   ▼              │
│                            ┌─────────────┐      │
│                            │  PostgreSQL │      │
│                            │   :5432     │      │
│                            └─────────────┘      │
└──────────────────────────────────────────────────┘
```

---

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables: `cat .env`
3. Check container status: `docker-compose ps`
4. Open an issue on GitHub
