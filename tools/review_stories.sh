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

declare -A ACTIVE_DIRS

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

process_directory() {
  local dir="$1"

  if [[ -n "${ACTIVE_DIRS[$dir]:-}" ]]; then
    return
  fi

  ACTIVE_DIRS["$dir"]=1

  (
    log "Reviewing directory: $dir"

    # allow files to finish writing
    sleep 2

    # verify directory still has json files
    if ! find "$dir" \
      -type f \
      -name '*.json' \
      ! -name '*_review.json' \
      | grep -q .
    then
      log "No story files left in $dir"
      exit 0
    fi

    if ! node "$REVIEW_AGENT" \
      "$dir" \
      --approved-dir "$APPROVED_DIR" \
      --rejected-dir "$REJECTED_DIR"
    then
      log "Review failed for: $dir"
      exit 1
    fi

    log "Finished reviewing: $dir"
  )

  unset ACTIVE_DIRS["$dir"]
}

copy_reviews() {

  while IFS= read -r -d '' review_file; do

    story_file="${review_file%_review.json}.json"

    rel="${review_file#$INDIR/}"
    rel="${rel%/*}"

    story_base="$(basename "$story_file" .json)"

    review_target="$REVIEW_DIR/$rel"

    mkdir -p "$review_target"

    cp -f \
      "$review_file" \
      "$review_target/Review_${story_base}.json"

  done < <(
    find "$INDIR" \
      -type f \
      -name '*_review.json' \
      -print0
  )
}

scan_directories() {

  mapfile -d '' dirs < <(
    find "$INDIR" \
      -type f \
      -name '*.json' \
      ! -name '*_review.json' \
      -printf '%h\0' \
      | sort -zu
  )

  if [[ ${#dirs[@]} -eq 0 ]]; then
    log "No story directories found."
    return
  fi

  for dir in "${dirs[@]}"; do
    process_directory "$dir"
  done

  copy_reviews
}

log "========================================"
log "Story Review Watcher Started"
log "Watching: $INDIR"
log "========================================"

while true; do
  scan_directories
  sleep "$SCAN_INTERVAL"
done