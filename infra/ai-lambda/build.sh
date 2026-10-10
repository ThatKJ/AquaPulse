#!/usr/bin/env bash
# Bundle handler.ts (and the lib/aws code it imports) into dist/function.zip. No network, no AWS calls.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
rm -rf "$here/dist"
mkdir -p "$here/dist"
# The AWS SDK is bundled on purpose: the deployed code then matches the versions that were tested locally.
"$root/node_modules/.bin/esbuild" "$here/handler.ts" \
  --bundle --platform=node --target=node22 --format=cjs --minify --legal-comments=none \
  --outfile="$here/dist/index.js"
(cd "$here/dist" && zip -q -X function.zip index.js)
echo "BUILD_OK $(wc -c < "$here/dist/function.zip" | tr -d ' ') bytes -> infra/ai-lambda/dist/function.zip"
