#!/bin/bash
# Batch Story Creator: Generate images for all stories in autoReviewed

REL="05-21"  # You may want to make this dynamic or pass as an argument
ASPECT="LANDSCAPE"
STORY_DIR="./output/autoReviewed"

for STORY_PATH in "$STORY_DIR"/*.json; do
  TITLE=$(basename "$STORY_PATH" .json | sed 's/%20/ /g')
  echo "Generating images for: $TITLE"
  ./Story_creator.sh "$STORY_PATH" "$TITLE" "$REL" "$ASPECT"
done
