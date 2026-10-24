#!/usr/bin/env bash
# ==============================================================================
# Production Deployment Script for Bot-AI (Task T7.1 - Jalur 2 VPS)
# ==============================================================================
set -euo pipefail

echo "=========================================================="
echo "    BOT-AI PRODUCTION DEPLOYMENT (JALUR 2: VPS SINGAPURA) "
echo "=========================================================="

# 1. Environment and Secrets Validation
if [ ! -f ".env" ]; then
  echo "[-] ERROR: .env file not found. Copy .env.example and populate production secrets."
  exit 1
fi

if grep -q "dummy_key_for_scaffold" .env; then
  echo "[-] ERROR: .env contains unconfigured dummy secrets. Please provide real credentials."
  exit 1
fi

# 2. Directory Structure Setup
echo "[+] Ensuring persistent directories exist..."
mkdir -p data logs backups

# 3. Pre-deployment Database Snapshot
if [ -f "data/memory.sqlite" ]; then
  echo "[+] Creating pre-deploy database snapshot..."
  BACKUP_TS=$(date +%Y%m%d_%H%M%S)
  cp "data/memory.sqlite" "backups/memory_pre_deploy_${BACKUP_TS}.sqlite"
  echo "[+] Pre-deploy snapshot created at backups/memory_pre_deploy_${BACKUP_TS}.sqlite"
fi

# 4. Pull & Build Docker Compose Production
echo "[+] Building and launching production container..."
docker compose -f docker-compose.prod.yml down --remove-orphans || true
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d bot

# 5. Health Check Probe Loop
echo "[+] Waiting for container health check to report ready..."
HEALTHY=false
for i in {1..12}; do
  sleep 5
  STATUS=$(docker inspect --format='{{json .State.Health.Status}}' bot-ai-production 2>/dev/null || echo "\"starting\"")
  echo "  Attempt $i/12: Health status is ${STATUS}"
  if [ "$STATUS" = "\"healthy\"" ]; then
    HEALTHY=true
    break
  fi
done

if [ "$HEALTHY" = true ]; then
  echo "[+] SUCCESS: Bot-AI container is running and healthy on VPS!"
  docker compose -f docker-compose.prod.yml ps
  exit 0
else
  echo "[-] WARNING: Container did not reach healthy state in 60s. Inspecting logs:"
  docker compose -f docker-compose.prod.yml logs --tail 50
  exit 1
fi
