#!/bin/bash
# Story_creator.sh: Run StoryToImage.js with arguments

# Usage: ./Story_creator.sh <storyPath> <title> <rel> <aspectRatio>
# Example: ./Story_creator.sh "./output/autoReviewed/05-21/The%20Box%20of%20Forgotten%20Stars.json" "The Box of Forgotten Stars" "05-21" "LANDSCAPE"

STORY_PATH=${1:-"./output/autoReviewed/05-21/The%20Box%20of%20Forgotten%20Stars.json"}
TITLE=${2:-"The Box of Forgotten Stars"}
REL=${3:-"05-21"}
ASPECT=${4:-"LANDSCAPE"}

node StoryToImage.js "$STORY_PATH" "$TITLE" "$REL" "$ASPECT"
