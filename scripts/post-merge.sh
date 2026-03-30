#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Backfill approved_at for previously-approved upgrade requests that lack it
psql "$DATABASE_URL" -c "UPDATE upgrade_requests SET approved_at = created_at WHERE status = 'APPROVED' AND approved_at IS NULL;" || true
