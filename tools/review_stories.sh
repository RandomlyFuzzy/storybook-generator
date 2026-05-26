#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(realpath "$SCRIPT_DIR/..")"

INDIR="$ROOT_DIR/output/reviewing"
APPROVED_DIR="$ROOT_DIR/output/autoReviewed"
REJECTED_DIR="$ROOT_DIR/output/NEEDSAutoReview"
REVIEW_DIR="$ROOT_DIR/output/autoReview"

REVIEW_AGENT="$ROOT_DIR/lib/review-agent.mjs"

SCAN_INTERVAL="${SCAN_INTERVAL:-5}"

mkdir -p \
  "$INDIR" \
  "$APPROVED_DIR" \
  "$REJECTED_DIR" \
  "$REVIEW_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

cleanup() {
  log "Stopping watcher..."
  exit 0
}

trap cleanup SIGINT SIGTERM

scan_directories() {

  if ! find "$INDIR" \
    -type f \
    -name '*.json' \
    | grep -q .
  then
    log "No story files found."
    return
  fi

  (
    log "Reviewing stories in $INDIR"

    # allow files to finish writing
    sleep 2

    if ! node "$REVIEW_AGENT" \
      "$INDIR" \
      --approved-dir "$APPROVED_DIR" \
      --rejected-dir "$REJECTED_DIR"
    then
      log "Review failed"
      exit 1
    fi

    log "Finished reviewing"
  )
}

log "========================================"
log "Story Review Watcher Started"
log "Watching: $INDIR"
log "========================================"

while true; do
  scan_directories
  sleep "$SCAN_INTERVAL"
done