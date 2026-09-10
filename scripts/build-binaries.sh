#!/usr/bin/env bash
# Compiles one static slooks binary per supported platform into dist/ and
# writes their checksums. Every target cross-compiles from any host, so one
# runner builds the whole set. A target list on the command line narrows it.
set -euo pipefail

cd "$(dirname "$0")/.."

targets=("$@")

if [ ${#targets[@]} -eq 0 ]; then
  targets=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)
fi

rm -rf dist
mkdir -p dist

for target in "${targets[@]}"; do
  bun build --compile --target="bun-$target" src/main.ts --outfile "dist/slooks-$target"
done

(cd dist && shasum -a 256 slooks-* > SHA256SUMS)
