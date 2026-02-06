#!/bin/bash
# Deploy all games to the Netlify site
# Usage: ./scripts/deploy.sh

set -e

SITE_ID="9738820d-d6e7-4c5b-a89d-4c18ab855e80"

echo "=== Deploying to book-adventure-game.netlify.app ==="

# Build the runtime
echo "Building runtime..."
npm run build:runtime

# Create temp deploy directory
TMPDIR=$(mktemp -d)
echo "Staging files in $TMPDIR..."

# Copy build output (runtime.iife.js + index.html)
cp packages/runtime/dist/index.html packages/runtime/dist/runtime.iife.js "$TMPDIR/"

# Copy all game files
cp games/*.json "$TMPDIR/"

echo "Deploy contents:"
ls -lh "$TMPDIR/"

# Deploy to Netlify
echo "Deploying to Netlify..."
npx netlify-cli deploy --prod --dir="$TMPDIR" --site="$SITE_ID"

# Clean up
rm -rf "$TMPDIR"

echo "=== Done! ==="
