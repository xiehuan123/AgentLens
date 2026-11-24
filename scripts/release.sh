#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

tag=${1:-}
if [ "$#" -ne 1 ] || ! printf '%s\n' "$tag" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo 'Usage: ./scripts/release.sh vMAJOR.MINOR.PATCH' >&2
  exit 2
fi

cargo_version=$(sed -n 's/^version = "\([^"]*\)"$/\1/p' Cargo.toml)
tauri_version=$(sed -n 's/^ *"version": "\([^"]*\)",*$/\1/p' tauri.conf.json)
if [ "${tag#v}" != "$cargo_version" ] || [ "${tag#v}" != "$tauri_version" ]; then
  echo 'The tag must match both Cargo.toml and tauri.conf.json.' >&2
  exit 2
fi

if [ "$(git symbolic-ref --quiet --short HEAD)" != main ]; then
  echo 'Run this release command from main.' >&2
  exit 2
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Commit tracked changes before releasing.' >&2
  exit 2
fi

git remote get-url origin >/dev/null
if git show-ref --verify --quiet "refs/tags/$tag"; then
  if [ "$(git rev-parse "$tag^{commit}")" != "$(git rev-parse HEAD)" ]; then
    echo "Local tag $tag points at another commit." >&2
    exit 2
  fi
else
  git tag -a "$tag" -m "AgentLens $tag"
fi

git push --atomic origin refs/heads/main "refs/tags/$tag"
printf 'Pushed %s. Follow the release build with gh run list --workflow release.yml.\n' "$tag"
