#!/bin/bash

# Directory containing generated stories (default: output/mm-dd)
DATE=$(date +"%m-%d")
INDIR="output/$DATE"
REVIEWDIR="output/reviewed/$DATE"

mkdir -p "$REVIEWDIR"

# Loop through all JSON files in the input directory
for file in "$INDIR"/*.json; do
  # Check if file exists (skip if none)
  [ -e "$file" ] || continue

  # Extract theme and title for logging
  THEME=$(jq -r '.theme // empty | if type=="array" then .[0] else . end' "$file")
  TITLE=$(jq -r '.title // "(no title)"' "$file")

  # Automated review using Ollama
  PROMPT="You are a children’s book reviewer. Given the following story JSON, answer only YES or NO. Is this story suitable for children (ages 3–8) and does it have a compelling, positive, and age-appropriate story? Only answer YES or NO.\n\nSTORY:\n$(cat \"$file\")"
  REVIEW=$(ollama generate gemma4:e2b "$PROMPT" | head -n 1 | tr -d '\r\n' | tr '[:upper:]' '[:lower:]')

  if [[ "$REVIEW" == "yes"* ]]; then
    mv "$file" "$REVIEWDIR/"
    echo "[REVIEWED] $TITLE (theme: $THEME) -> $REVIEWDIR/"
  else
    echo "[SKIPPED]  $TITLE (theme: $THEME) [Ollama: $REVIEW]"
  fi
done

echo "Review complete. Eligible stories moved to $REVIEWDIR/"
