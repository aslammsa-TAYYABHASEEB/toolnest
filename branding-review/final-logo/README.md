# ToolNest final logo system — M1-A owner review

This folder is a review package only. It is not connected to the application header, favicon, metadata, manifest, structured data, or category icons.

## Frozen symbol

`logo-symbol.svg` is the exact selected M1-A geometry on its original 64 × 64 grid. The geometry is repeated without alteration in the mono, reversed, tile, lockup, and icon review assets. The canonical production colour is `#5B4CF0`; dark UI contexts use the approved optical variant `#887CFF`.

## Wordmark approach

The wordmark is a hand-authored geometric construction made entirely from SVG paths. It does not contain live text and does not depend on an installed, web-hosted, or runtime font. Sora, Manrope, Plus Jakarta Sans, and Outfit were checked locally but were not installed, so no font was downloaded or substituted.

The `Tool`/`Nest` split is reinforced by both colour and spacing. The lowercase `l` has a rightward terminal and ends before a deliberate 9-unit gap; the uppercase `N` begins in indigo at its full cap height. This prevents the junction from reading as `TooINest` while keeping the CamelCase spelling intact.

## Review files

### Vector masters and lockups

- `logo-symbol.svg`
- `logo-symbol-mono.svg`
- `logo-symbol-reversed.svg`
- `logo-tile-light.svg`
- `logo-tile-dark.svg`
- `wordmark.svg`
- `logo-horizontal.svg`
- `logo-stacked.svg`
- `logo-horizontal-reversed.svg`
- `logo-stacked-reversed.svg`
- `icons/icon.svg`

### Header review

- `headers/header-light-desktop.png`
- `headers/header-dark-desktop.png`
- `headers/header-mobile.png`
- `headers/header-review.png`

### Icon and favicon review

- `icons/favicon-16-review.png`
- `icons/favicon-32-review.png`
- `icons/favicon-48-review.png`
- `icons/favicon-review-32-48.png`
- `icons/apple-180-preview.png`
- `icons/icon-192-preview.png`
- `icons/icon-512-preview.png`
- `icons/icon-maskable-512-review.png`
- `icons/maskable-safe-zone-review.png`

### QA and presentation

- `previews/lockup-review.png`
- `brand-sheet.png`
- `qa/icon-512.png`
- `qa/qa-icon.png`
- `qa/qa-mono.png`
- `qa/silhouette-32.png`
- `qa/mask-circle.png`
- `qa/mask-rounded.png`
- `qa/production-icon-512.png`
- `qa/production-qa-icon.png`
- `qa/production-qa-mono.png`
- `production-color-comparison.svg`
- `production-color-comparison.png`

## QA result

- 16 px readability in canonical `#5B4CF0`: pass
- 32 px and 48 px edge survival: pass
- One-colour and 32 px silhouette: pass
- Symbol fill ratio: 0.72, within the supplied 0.55–0.85 guideline
- Canonical purple on white: 5.62:1
- Navy on white: 17.85:1
- Light and dark header treatments: pass
- Circle and rounded-square crop checks: pass
- Maskable symbol is inside the circular 80% safe-zone guide: pass
- Raster images embedded in SVG: none
- SVG filters or gradients in production masters: none
- Live text, external font, or external asset references: none

## Production integration assignment

- Light header: symbol and `Nest` use `#5B4CF0`; `Tool` uses `#0F172A`
- Dark header and footer: symbol and `Nest` use `#887CFF`; `Tool` uses `#FFFFFF`
- Canonical favicon and Apple icon: `#5B4CF0`
- Single-colour reversed mark: `#FFFFFF`
- Production UI colour tokens remain unchanged

## Human checks still required

- Owner approval of the custom wordmark proportions and the `l`/`N` spacing at real production sizes
- Independent trademark and similarity review for both the symbol and complete lockup
- Browser/OS favicon and home-screen testing after, and only after, integration is approved
