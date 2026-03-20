#!/bin/sh
# ============================================================================
# GigShield AI — Server Entrypoint
# ============================================================================
set -e

echo ""
echo "🛡️  GigShield AI — Server Starting..."

# ── Wait for Postgres to accept connections ──
echo "⏳ Waiting for PostgreSQL..."
RETRIES=30
until node -e "
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  p.query('SELECT 1').then(() => { p.end(); process.exit(0); }).catch(() => { p.end(); process.exit(1); });
" 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "❌ PostgreSQL not reachable after 60s. Exiting."
    exit 1
  fi
  sleep 2
done
echo "✅ PostgreSQL is ready."

# ── Seed demo data if DEMO_SEED=true ──
if [ "$DEMO_SEED" = "true" ]; then
  echo "🌱 Seeding demo data..."
  node scripts/demo-seed.js 2>&1 || echo "⚠️  Seed skipped (may already exist)"
fi

# ── Start ──
echo "🚀 Starting on port ${PORT:-5000}..."
exec node server.js
