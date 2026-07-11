#!/bin/bash
# CRASH LAB build: concat chunks -> single HTML (full doc + artifact body-only variant)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/src"
THREE="$DIR/../opt/three-slim.js"
OUT_FULL="$DIR/crashlab.html"

{
  echo '<!DOCTYPE html>'
  echo '<html lang="ko">'
  echo '<head>'
  cat "$SRC/00_head.html"
  echo '</head>'
  echo '<body>'
  cat "$SRC/01_dom.html"
  echo '<script>'
  cat "$THREE"
  echo '</script>'
  echo '<script>'
  cat "$SRC/15_baked.js" "$SRC/16_assets.js" "$SRC/20_core.js" "$SRC/30_physics.js" "$SRC/31_vehicle.js" "$SRC/40_cars.js" "$SRC/45_softbody.js" \
      "$SRC/41_maps.js" "$SRC/42_mapdefs.js" "$SRC/50_fx.js" "$SRC/60_game.js" \
      "$SRC/70_input.js" "$SRC/71_ui.js" "$SRC/72_editor.js" "$SRC/80_main.js"
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > "$OUT_FULL"

# artifact variant: minified game code, no doctype/html/head/body wrappers
cat "$SRC/15_baked.js" "$SRC/16_assets.js" "$SRC/20_core.js" "$SRC/30_physics.js" "$SRC/31_vehicle.js" "$SRC/40_cars.js" "$SRC/45_softbody.js" \
    "$SRC/41_maps.js" "$SRC/42_mapdefs.js" "$SRC/50_fx.js" "$SRC/60_game.js" \
    "$SRC/70_input.js" "$SRC/71_ui.js" "$SRC/72_editor.js" "$SRC/80_main.js" > "$DIR/game.cat.js"
(cd "$DIR/../opt" && npx esbuild "$DIR/game.cat.js" --minify --format=iife --charset=utf8 --outfile="$DIR/game.min.js" --log-level=error)
{
  cat "$SRC/00_head.html"
  cat "$SRC/01_dom.html"
  echo '<script>'
  cat "$THREE"
  echo '</script>'
  echo '<script>'
  cat "$DIR/game.min.js"
  echo '</script>'
} > "$DIR/crashlab-artifact.html"

echo "built: $(wc -c < "$OUT_FULL") bytes (full), $(wc -c < "$DIR/crashlab-artifact.html") bytes (artifact)"
