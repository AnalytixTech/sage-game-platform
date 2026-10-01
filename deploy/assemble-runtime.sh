#!/bin/sh
# Copies what the runtime needs into $1: production node_modules, and for each workspace the API
# uses, its package.json, dist and own node_modules (npm nests some versions there).
set -eu
out="$1"
mkdir -p "$out"
cp package.json "$out/"
cp -R node_modules "$out/"
for ws in packages/types packages/engine games/memory-match games/quiz-master games/sudoku games/word-rush games/word-search services/api; do
  mkdir -p "$out/$ws"
  cp "$ws/package.json" "$out/$ws/"
  cp -R "$ws/dist" "$out/$ws/"
  if [ -d "$ws/node_modules" ]; then cp -R "$ws/node_modules" "$out/$ws/"; fi
done
mkdir -p "$out/services/portal"
cp -R services/portal/dist "$out/services/portal/"
