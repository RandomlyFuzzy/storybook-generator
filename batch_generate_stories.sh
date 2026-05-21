#!/bin/bash

# Number of stories to generate (default 5)
COUNT=${1:-5}
# Pages per story (default 20)
PAGES=${2:-20}
# Output base directory
OUTDIR="output/reviewing"
# Date for subdirectory (mm-dd)
DATE=$(date +"%m-%d")
# Make sure output directory exists
mkdir -p "$OUTDIR/$DATE"

echo "Generating $COUNT stories into $OUTDIR/$DATE/ ..."


for i in $(seq 1 $COUNT)
do
  # Let story.js handle output file naming by title in the output directory
  node story.js --pages "$PAGES" --out "$OUTDIR/$DATE" --verbose
done

echo "Batch generation complete."
