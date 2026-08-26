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

DEPLOY_ID="${CLASP_DEPLOYMENT_ID:-$(grep -o '"deploymentId": *"[^"]*"' .clasp.json 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/' || true)}"
if [ -z "${DEPLOY_ID:-}" ]; then
  echo
  echo "No deployment id recorded. Existing deployments:"
  clasp list-deployments
  echo
  echo "Re-run with:  CLASP_DEPLOYMENT_ID=<the AKfycb... id> $0"
  exit 1
fi

clasp redeploy "$DEPLOY_ID" -d "build $BUILD"

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
