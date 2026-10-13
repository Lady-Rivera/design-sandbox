# Brand Intake — folding in the client's branding

Read this when branding arrives — in the rep's opening message or any time after the first build. Nothing here is a question to ask up front; the sandbox is already built and delivered. This file is about turning what the rep sent into `brand.json` and rebuilding.

Accepted inputs, any subset: hex codes, font names, a logo file (png, svg, jpg, webp), a screenshot of the client's site or brand guide. Ask for nothing else — not density, not mode, not a design system. If something essential is genuinely missing for what the rep asked ("use their fonts" with no font named), say so in one line and build with what is there.

## If a screenshot came back

Read the branding off the image, then **show the rep what you read before building** — this is the one place the intake produces values the rep did not type:

- **Colors.** Pull the dominant brand colors programmatically where a tool exists (Pillow / ImageMagick: quantize to ~8 colors, drop near-white and near-black, take the most saturated as primary), and eyeball the image to confirm that is the accent the brand actually uses, not a photo. Give the result as hex.
- **Fonts.** Name the family if it is recognizable; otherwise name the closest Google Fonts match and say it is a match, not the real font ("looks like a geometric sans — closest stock pair is Manrope + Public Sans").
- **Logo.** If the screenshot contains a clean logo on a flat background and no separate logo file was given, crop it out and use it; otherwise leave the placeholder mark and say a logo file would be better.

Reply in two or three lines — "From the screenshot: primary #1F4E79, secondary #E8A33D; headings look like a serif close to Playfair Display; cropped the logo from the header. Build with these?" — and wait for a yes or a correction. Typed hex codes always beat values read from an image; where both were given, the typed ones win.

## Turning the reply into `brand.json`

Write it fresh into the client's output folder:

```json
{
  "name": "<Client>",
  "colors": ["#0B5C4B"],
  "fonts": { "head": "Söhne", "body": "Source Serif" },
  "logo": "./client-logo.png"
}
```

- Every hex found in the text goes into `colors`, in the order given (first = primary). Three-digit hexes are fine. Colors read from a screenshot go in only after the rep confirmed them.
- Font names: the first is `head`, the second `body`; a single name is used for both. If a font is on Google Fonts, add its `google` query string (e.g. `"google": "Source+Serif+4:wght@400;600"`); if not, omit `google` — the canvas will show the fallback stack and the export records the real names.
- An attached logo (png, svg, jpg or webp) is saved next to `brand.json` and referenced relatively. Keep it under ~70 KB; downsample if larger.
- Anything that is neither a hex nor a font name (a URL, a note) goes into the export packet's "Requests and notes", not into `brand.json` and not into another question.
- If the reply has nothing usable ("actually, skip it"), build without branding and say so in one line.

Then rebuild with `--brand` (SKILL.md § 2) and republish to the same canvas (§ 3).

Once rebuilt, the page shows an **Apply <Client> brand** button at the end of the Color row; tell the rep it exists in the hand-over line.
