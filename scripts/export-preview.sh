#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo 'Usage: scripts/export-preview.sh /absolute/path/outside/repository/index.html' >&2
  exit 1
fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
output=$(realpath -m -- "$1")
case "$output" in
  "$repo"|"$repo"/*) echo 'Preview must be outside the repository.' >&2; exit 1 ;;
esac
mkdir -p -- "$(dirname -- "$output")"
# Resolve existing symlinked parents before writing any response.
output=$(realpath -m -- "$output")
case "$output" in
  "$repo"|"$repo"/*) echo 'Preview must be outside the repository.' >&2; exit 1 ;;
esac
umask 077
temporary=$(mktemp "$(dirname -- "$output")/.preview.XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT
curl --fail --silent --show-error --retry 20 --retry-all-errors \
  --retry-delay 1 --retry-max-time 60 --connect-timeout 2 --max-time 5 \
  http://127.0.0.1:8787/digest/2026-10-28 --output "$temporary"
[[ -s "$temporary" ]]
mv -f -- "$temporary" "$output"
echo 'Preview exported outside the repository.'
