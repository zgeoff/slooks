#!/usr/bin/env bash
# Resolve recovery to an existing release tag, never a moving branch.
set -euo pipefail

tag="${1:-}"
if [ -z "$tag" ]; then
  git rev-parse HEAD
  exit 0
fi

if [[ "$tag" != @zgeoff/slooks@* ]]; then
  echo "expected a release tag such as @zgeoff/slooks@0.1.0" >&2
  exit 1
fi

sha=$(git rev-parse --verify "refs/tags/$tag^{commit}")
version=$(git show "$sha:package.json" | jq -er .version)
if [ "$tag" != "@zgeoff/slooks@$version" ]; then
  echo "release tag does not match package.json version $version" >&2
  exit 1
fi

printf '%s\n' "$sha"
