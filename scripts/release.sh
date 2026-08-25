#!/usr/bin/env bash
# Record provenance for a release: hash every tracked file, timestamp the
# manifest into the Bitcoin blockchain, and cut a signed tag.
#
#   ./scripts/release.sh v1.0 "Annual Jam gallery, batch short links"
#
# The .ots proof is what makes the date unforgeable. Anyone can backdate a git
# commit; nobody can backdate a Bitcoin block.
set -euo pipefail

TAG="${1:-}"; NOTE="${2:-}"
[ -z "$TAG" ] && { echo "usage: $0 <tag> [note]"; exit 1; }

OTS="$(command -v ots || echo /Library/Frameworks/Python.framework/Versions/3.14/bin/ots)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUT="provenance/${TAG}.manifest.txt"

cd "$(dirname "$0")/.."
python3 scripts/stamp-copyright.py --check >/dev/null || {
  echo "Some files have no copyright header. Run scripts/stamp-copyright.py first."; exit 1; }

{
  echo "iMAP source manifest"
  echo "Release:   $TAG"
  echo "Recorded:  $STAMP"
  echo "Commit:    $(git rev-parse HEAD)"
  echo "Owner:     Indie Movement Art Project (iMAP)"
  echo "Author:    Prashant Nair, Creative Technologist"
  [ -n "$NOTE" ] && echo "Note:      $NOTE"
  echo
  echo "SHA-256 of every tracked file at this commit:"
  echo
  git ls-files -z | sort -z | xargs -0 shasum -a 256
} > "$OUT"

echo "manifest: $OUT  ($(grep -c '^[0-9a-f]\{64\}' "$OUT") files)"

"$OTS" stamp "$OUT" && echo "timestamped: ${OUT}.ots"
echo "  (the proof completes in a few hours — run: $OTS upgrade ${OUT}.ots)"

git add provenance
git commit -q -S -m "Provenance for $TAG

SHA-256 manifest of every tracked file, timestamped via OpenTimestamps.
${NOTE}

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || echo "  (nothing new to commit)"
git tag -s "$TAG" -m "$TAG${NOTE:+ — $NOTE}"
echo "signed tag: $TAG   — push with: git push && git push origin $TAG"
