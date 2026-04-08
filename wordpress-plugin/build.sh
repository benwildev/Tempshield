#!/usr/bin/env bash
# Package the LeadCop WordPress plugin.
# Output: artifacts/tempshield/public/downloads/leadcop-email-validator.zip
set -euo pipefail

cd "$(dirname "$0")"

OUT="../artifacts/tempshield/public/downloads/leadcop-email-validator.zip"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

zip -r "$OUT" leadcop-email-validator/ \
    --exclude "*.DS_Store" \
    --exclude "__MACOSX/*" \
    --exclude ".git*"

echo "Built: $OUT"
