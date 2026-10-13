#!/bin/bash
# fetch-fonts.sh — the same job as fetch-fonts.mjs, with nothing but curl and awk (macOS Terminal
# has both). Downloads the latin-subset woff2 files for the sandbox's five font pairs and writes
# fonts.json beside them for scripts/build.mjs to inline.
#
#   bash fetch-fonts.sh [out-dir]          default out-dir: ./fonts
#   bash fetch-fonts.sh out-dir "Inter:wght@400..700"   a single family (brand font)
#
# Needs normal internet access (fonts.googleapis.com, fonts.gstatic.com).
set -euo pipefail
OUT="${1:-./fonts}"; mkdir -p "$OUT"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

# family|variable-range query|discrete-weights query  (range first; static families have none)
STOCK='Manrope|Manrope:wght@500..800|Manrope:wght@500;600;700;800
Public Sans|Public+Sans:wght@400..600|Public+Sans:wght@400;500;600
DM Serif Display||DM+Serif+Display
DM Sans|DM+Sans:wght@400..700|DM+Sans:wght@400;500;600;700
Space Grotesk|Space+Grotesk:wght@500..700|Space+Grotesk:wght@500;600;700
IBM Plex Sans|IBM+Plex+Sans:wght@400..600|IBM+Plex+Sans:wght@400;500;600
Playfair Display|Playfair+Display:wght@500..700|Playfair+Display:wght@500;600;700
Source Sans 3|Source+Sans+3:wght@400..600|Source+Sans+3:wght@400;500;600
Nunito|Nunito:wght@600..800|Nunito:wght@600;700;800
Nunito Sans|Nunito+Sans:wght@400..600|Nunito+Sans:wght@400;500;600'
if [ -n "${2:-}" ]; then fam=$(printf '%s' "$2" | cut -d: -f1 | tr '+' ' '); STOCK="$fam||$2"; fi

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g'; }
css() { curl -sSf -A "$UA" "https://fonts.googleapis.com/css2?family=$1&display=swap"; }
# Print one line per latin @font-face: family<TAB>style<TAB>weight<TAB>unicode-range<TAB>url
latin_faces() {
  awk '
    /\/\* latin \*\// { take=1; next }
    /\/\* [a-z0-9-]+ \*\// { take=0 }
    take && /font-family:/ { gsub(/.*font-family:[ ]*|;.*/, ""); gsub(/[\x27"]/, ""); fam=$0 }
    take && /font-style:/  { gsub(/.*font-style:[ ]*|;.*/, ""); sty=$0 }
    take && /font-weight:/ { gsub(/.*font-weight:[ ]*|;.*/, ""); wgt=$0 }
    take && /unicode-range:/ { gsub(/.*unicode-range:[ ]*|;.*/, ""); ur=$0 }
    take && /src:/ { match($0, /url\([^)]*\)/); url=substr($0, RSTART+4, RLENGTH-5) }
    take && /^}/ { printf "%s\t%s\t%s\t%s\t%s\n", fam, sty, wgt, ur, url; take=0; ur="" }
  '
}

faces=(); total=0
while IFS='|' read -r family range discrete; do
  [ -z "$family" ] && continue
  lines=""
  for q in "$range" "$discrete"; do
    [ -z "$q" ] && continue
    if body=$(css "$q" 2>/dev/null); then lines=$(printf '%s\n' "$body" | latin_faces); [ -n "$lines" ] && break; fi
  done
  [ -z "$lines" ] && { echo "!! no latin @font-face for $family" >&2; exit 1; }
  while IFS=$'\t' read -r fam sty wgt ur url; do
    file="$(slug "$fam")-$(printf '%s' "$wgt" | tr ' ' '_')"; [ "$sty" != "normal" ] && file="$file-$sty"; file="$file.woff2"
    curl -sSf -A "$UA" -o "$OUT/$file" "$url"
    bytes=$(wc -c < "$OUT/$file" | tr -d ' ')
    total=$((total+bytes))
    faces+=("{\"family\":\"$fam\",\"style\":\"$sty\",\"weight\":\"$wgt\",\"unicodeRange\":\"$ur\",\"file\":\"$file\",\"bytes\":$bytes,\"query\":\"$q\"}")
    echo "  $fam $wgt → $file ($((bytes/1024)) KB)" >&2
  done <<< "$lines"
done <<< "$STOCK"

{
  printf '{\n  "fetchedAt": "%s",\n  "license": "SIL Open Font License 1.1 (all Google Fonts used here)",\n  "faces": [\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for i in "${!faces[@]}"; do printf '    %s%s\n' "${faces[$i]}" "$([ "$i" -lt $((${#faces[@]}-1)) ] && echo ,)"; done
  printf '  ]\n}\n'
} > "$OUT/fonts.json"
echo "${#faces[@]} latin woff2 files, $((total/1024)) KB → $OUT"
