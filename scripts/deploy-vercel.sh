#!/usr/bin/env bash
# Deploy to Vercel with env vars taken from .env.local (never printed).
#   bash scripts/deploy-vercel.sh          preview deployment
#   bash scripts/deploy-vercel.sh --prod   production alias (aquapulse-liard.vercel.app)
set -euo pipefail
cd "$(dirname "$0")/.."
g() { grep "^$1=" .env.local | cut -d= -f2- || true; }
args=(deploy --yes "$@" -e AWS_REGION=ap-south-1)
add() { [ -n "$2" ] && args+=(-e "$1=$2"); return 0; }
addb() { [ -n "$2" ] && args+=(-e "$1=$2" -b "$1=$2"); return 0; }
add AI_ENDPOINT_URL "$(g AI_ENDPOINT_URL_PUBLIC)"
add AI_ENDPOINT_SECRET "$(g AI_ENDPOINT_SECRET_LOCAL)"
addb NEXT_PUBLIC_SUPABASE_URL "$(g NEXT_PUBLIC_SUPABASE_URL)"
addb NEXT_PUBLIC_SUPABASE_ANON_KEY "$(g NEXT_PUBLIC_SUPABASE_ANON_KEY)"
add SUPABASE_SERVICE_ROLE_KEY "$(g SUPABASE_SERVICE_ROLE_KEY)"
add WEBHOOK_SECRET "$(g WEBHOOK_SECRET)"
for k in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER TWILIO_MODE TWILIO_ALLOWED_TO N8N_BASE_URL; do add "$k" "$(g $k)"; done
npx vercel "${args[@]}" 2>&1 | grep -E '^https://|"url"|Error|error' | grep -vE 'SECRET|KEY|TOKEN' | tail -3
