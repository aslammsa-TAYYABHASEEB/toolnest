# ToolNest production tool-icon system

## Status

Implemented on `brand/tool-icon-system` for final visual review. This folder documents the actual production registry and components; it is not a separate mock system.

## Inventory

- 25 tool icons
- 21 individually imported Lucide icons
- 4 local ToolNest custom icons
- 4 Lucide category icons

See `mapping.md` for the complete semantic key, source, component, and rationale for every tool and category.

## Architecture

- `lib/icon-keys.ts` owns the exhaustive semantic key unions.
- `components/icons/tool-icon.tsx` owns the single static registry and the decorative `ToolIcon` / `CategoryIcon` renderers.
- `components/icons/custom/toolnest-icons.tsx` owns the four local custom components.
- `lib/site.ts` stores semantic keys only; it does not store React components.
- Missing or invalid keys fail TypeScript validation. There is no arbitrary text or runtime fallback.
- Lucide icons use individual static imports from the locally bundled `lucide-react` package.

## Custom-icon construction rules

1. Use a 24x24 viewBox and 2px centered stroke.
2. Use round caps and round joins.
3. Use `fill="none"` and semantic `currentColor`.
4. Keep geometry within the standard safe zone and maintain low visual density.
5. Use one source object and one task-specific modifier.
6. Do not use vendor marks, file-type letters, shields, locks, checks, gradients, shadows, or category-specific colours.
7. Custom icons are allowed only where a familiar single Lucide icon would be materially ambiguous.

### Custom set

- Document Privacy: document + external inspection lens.
- Searchable PDF: document + internal text-layer scan frame.
- PDF to Excel: source document + neutral structured grid.
- Image to Text: image source + directional text lines.

## Production rendering

- Standard and featured cards: 24px.
- Compact cards and Related Tools: 22px.
- Category cards: 26px.
- Category page headers: 28px.
- Mobile navigation category icons: 16px.
- Icons are decorative where visible text supplies the meaning: `aria-hidden="true"`, `focusable="false"`.

## Production-backed visual review

`production-contact-sheet.png` contains actual rendered components from:

- homepage popular and compact tools, light and dark;
- PDF category;
- Image category;
- Text category;
- Calculators category;
- Related Tools on the PDF to Excel page;
- 390px dark homepage.

## QA summary

- 24 route/theme/viewport combinations checked.
- Desktop: 1440x900.
- Mobile: 390x844.
- Homepage, all four category pages, and PDF to Excel with Related Tools checked in light and dark.
- Standard icon size: 24px.
- Compact icon size: 22px.
- No clipped SVGs.
- No horizontal overflow.
- No decorative accessibility-attribute failures.
- Full-card keyboard activation passed.
- Search keyboard navigation passed.
- Mobile navigation passed.
- No console errors, page errors, failed requests, HTTP errors, or external network requests.
- TypeScript check passed.
- Production build passed with all 41 static pages generated.

## Visual-risk notes

- `FileStack` can mean copy/version history without a visible label, but is clear beside PDF Merge.
- `FileInput` and `FileOutput` depend on direction plus the adjacent JPG/PDF names; they are intentionally paired.
- `RefreshCw` is a general conversion metaphor, but remains distinct from ImageUpscale and ImageDown.
- PDF to Excel is the custom density ceiling and should not be reduced below the approved compact range.
