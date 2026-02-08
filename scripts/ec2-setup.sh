#!/bin/bash
set -e

echo "========================================="
echo "Solana Trading Bot - EC2 Setup Script"
echo "========================================="

# Update system
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# Install required packages
echo "Installing dependencies..."
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nginx \
    certbot \
    python3-certbot-nginx

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker ubuntu
    sudo systemctl enable docker
    sudo systemctl start docker
fi

# Install Docker Compose standalone (for compatibility)
echo "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Create app directory
echo "Setting up application directory..."
sudo mkdir -p /opt/solana-trading-bot
sudo chown -R ubuntu:ubuntu /opt/solana-trading-bot

# Create deployment user and directories
sudo mkdir -p /home/ubuntu/.ssh
sudo chmod 700 /home/ubuntu/.ssh

# Create log directory
sudo mkdir -p /var/log/solana-trading-bot
sudo chown -R ubuntu:ubuntu /var/log/solana-trading-bot

# Configure nginx
echo "Configuring nginx..."
sudo tee /etc/nginx/sites-available/solana-trading-bot > /dev/null << 'NGINX_CONFIG'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # API proxy
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }

    # Frontend static files
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONFIG

# Enable site
sudo ln -sf /etc/nginx/sites-available/solana-trading-bot /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Create systemd service for the app
echo "Creating systemd service..."
sudo tee /etc/systemd/system/solana-trading-bot.service > /dev/null << 'SERVICE_CONFIG'
[Unit]
Description=Solana Trading Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/solana-trading-bot
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
SERVICE_CONFIG

# Enable the service
sudo systemctl daemon-reload
sudo systemctl enable solana-trading-bot

# Setup log rotation
echo "Setting up log rotation..."
sudo tee /etc/logrotate.d/solana-trading-bot > /dev/null << 'LOGROTATE_CONFIG'
/var/log/solana-trading-bot/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        docker-compose -f /opt/solana-trading-bot/docker-compose.yml kill -s USR1 api 2>/dev/null || true
    endscript
}
LOGROTATE_CONFIG

# Configure firewall
echo "Configuring firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable

# Create deployment script
echo "Creating deployment helper script..."
cat > /opt/solana-trading-bot/deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

cd /opt/solana-trading-bot

echo "Pulling latest changes..."
git pull origin main

echo "Building and starting containers..."
docker-compose down --remove-orphans || true
docker-compose build --no-cache
docker-compose up -d

echo "Waiting for services to start..."
sleep 10

echo "Running database migrations..."
docker-compose exec -T api alembic upgrade head || echo "Migrations may have already run"

echo "Cleaning up old images..."
docker image prune -f

echo "Deployment complete!"
docker-compose ps
DEPLOY_SCRIPT
chmod +x /opt/solana-trading-bot/deploy.sh

echo ""
echo "========================================="
echo "EC2 Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository to /opt/solana-trading-bot"
echo "2. Create /opt/solana-trading-bot/.env with your secrets"
echo "3. Run: cd /opt/solana-trading-bot && docker-compose up -d"
echo ""
echo "For HTTPS, run:"
echo "  sudo certbot --nginx -d your-domain.com"
echo ""
