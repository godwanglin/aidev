#!/bin/bash
set -e

# Export Node.js & NPM binary paths if installed via aaPanel or system
if [ -d "/www/server/nodejs/v24.14.1/bin" ]; then
    export PATH="/www/server/nodejs/v24.14.1/bin:$PATH"
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "========================================="
echo " Deploying AIdev Gateway on VPS"
echo " Directory: $APP_DIR"
echo " Time: $(date)"
echo "========================================="

# 1. Ensure .env is preserved
if [ -f .env ]; then
    mkdir -p .git/info
    grep -qxF ".env" .git/info/exclude 2>/dev/null || printf "\n.env\n" >> .git/info/exclude
fi

# 2. Sync latest code from GitHub
echo "[1/6] Fetching latest changes from GitHub..."
git remote set-url origin https://github.com/godwanglin/aidev.git
git fetch origin
git reset --hard origin/main
git clean -fd -e .env

# 3. Install dependencies
echo "[2/6] Installing dependencies..."
if [ -f package-lock.json ]; then
    npm ci --include=dev || npm install --include=dev
else
    npm install --include=dev
fi

# 4. Generate Prisma Client & Sync DB
echo "[3/6] Generating Prisma client & syncing database..."
npx prisma generate
npx prisma db push

# Optional: seed subscription tiers if needed
if [ -f prisma/seed-tiers.js ]; then
    echo "Checking subscription tiers and pricing seed..."
    node prisma/seed-tiers.js || echo "Seed executed with warnings, continuing..."
fi

# 5. Build Next.js application
echo "[4/6] Building Next.js production bundle..."
npm run build

# 6. PM2 Process Management
echo "[5/6] Starting / Reloading PM2 process..."
if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2
fi

if pm2 describe "aidev-gateway" >/dev/null 2>&1; then
    echo "Reloading existing aidev-gateway process..."
    pm2 restart ecosystem.config.cjs --update-env
else
    echo "Starting new aidev-gateway PM2 process..."
    pm2 start ecosystem.config.cjs
fi

pm2 save

# 7. Verification
echo "[6/6] Verifying service health..."
sleep 3

if curl -s -f -o /dev/null "http://127.0.0.1:3026/"; then
    echo "SUCCESS: AIdev Gateway is responding on http://127.0.0.1:3026/!"
else
    echo "WARNING: Local port check did not return 200 OK immediately. Checking PM2 status..."
fi

pm2 describe aidev-gateway

echo "========================================="
echo " Deployment completed successfully!"
echo " Public URL: https://aidev.weebinhub.biz.id"
echo "========================================="
