#!/usr/bin/env bash
# Push apps-script/Code.gs to Google and update the LIVE deployment.
#
#   ./scripts/deploy-backend.sh
#
# This replaces the Deploy -> Manage deployments -> pencil -> New version dance,
# which silently redeploys the OLD code if the Version dropdown is left alone.
set -euo pipefail
cd "$(dirname "$0")/../apps-script"

BUILD=$(grep -o "BUILD = '[^']*'" Code.gs | sed "s/.*'\(.*\)'/\1/")
echo "Deploying build $BUILD"

clasp push --force

# The deployment the website actually posts to. There are a dozen on this
# project; updating any other one changes nothing a customer ever touches.
DEPLOY_ID="${CLASP_DEPLOYMENT_ID:-AKfycbyzOycWZQ8zKOWd4obluWv8frDtfFQbwa2bRN17NrHd6I-Lk3KZ5OsHhZ07FL0R_jik}"

SITE_ID=$(grep -o 'AKfycb[A-Za-z0-9_-]*' ../pay.html | head -1)
if [ -n "$SITE_ID" ] && [ "$SITE_ID" != "$DEPLOY_ID" ]; then
  echo "pay.html posts to $SITE_ID but this script targets $DEPLOY_ID." >&2
  echo "One of them is wrong — stopping rather than deploying to the wrong place." >&2
  exit 1
fi

VERSION=$(clasp create-version "build $BUILD" | grep -oE '[0-9]+$')
echo "Created version $VERSION"

clasp redeploy "$DEPLOY_ID" -V "$VERSION" -d "build $BUILD"

echo
echo "Confirming what the live endpoint now serves..."
sleep 4
LIVE=$(curl -sL --max-time 45 "https://script.google.com/macros/s/${DEPLOY_ID}/exec" \
        | grep -oE '2026-[0-9]{2}-[0-9]{2}-[a-z]' | sort -u | head -1 || true)
if [ "$LIVE" = "$BUILD" ]; then
  echo "LIVE: $LIVE  — matches. Done."
else
  echo "LIVE: ${LIVE:-unknown}  — expected $BUILD. The deployment did not take."
  exit 1
fi
