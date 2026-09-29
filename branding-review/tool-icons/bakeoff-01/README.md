# ToolNest tool icon system - bake-off 01

Review assets only. Nothing in this folder is integrated into the application.

## A. Current icon-system diagnosis

The current registry uses short text tokens such as `PDF`, `OCR`, `XLS`, `M`, `R`, and `%`. They are inexpensive and compact, but they mix file abbreviations, single initials, and symbols without one visual grammar. The result is functional but not strongly scannable: related tasks do not share consistent shapes, and branded-format abbreviations can overstate third-party identity.

The proposed direction is deliberately hybrid:

1. Familiar actions use established Lucide concepts.
2. ToolNest-specific workflows use local custom SVGs in the same 24x24 stroke grammar.
3. The tool name remains visible; the icon supports recognition rather than carrying the full accessible meaning.

No icon dependency is installed in this bake-off. Standard candidates were reviewed against the official Lucide pages for File Stack, Image Upscale, and Percent:

- https://lucide.dev/icons/file-stack
- https://lucide.dev/icons/image-upscale
- https://lucide.dev/icons/percent

The local standard SVGs are review representations, not production package imports.

## B. Six icon constructions

| Tool | Construction | Key decision |
| --- | --- | --- |
| Document Privacy | Document + inspection lens + sparse structural traces | Inspection without shield, lock, check, or safety claim |
| PDF to Excel | Source document overlapped by a neutral 3-column grid | Table extraction without Microsoft branding or XLS lettering |
| Searchable PDF | Document + scan-frame corners + two text lines | OCR/searchable layer without reusing the privacy magnifier |
| PDF Merge | Overlapping document stack | Familiar multiple-document metaphor |
| Image Resizer | Image frame + outward scale arrow | Familiar image-resize metaphor |
| Percentage Calculator | Percent symbol | Familiar mathematical metaphor |

Detailed construction notes are beside each custom `symbol.svg`.

## C. Standard vs custom classification

### Custom / flagship

- `document-privacy`
- `pdf-to-excel`
- `searchable-pdf`

### Standard / familiar

- `pdf-merge`: Lucide `FileStack` candidate
- `image-resizer`: Lucide `ImageUpscale` candidate
- `percentage-calculator`: Lucide `Percent` candidate

## D. Size comparison

See `comparison/size-comparison.png` and every icon's exact-size `preview-20.png`, `preview-24.png`, and `preview-32.png`.

At 24px all six are clear. At 20px:

- Document Privacy retains a distinct circular lens.
- Searchable PDF retains a rectangular scan/text center, so it does not collapse into the privacy symbol.
- PDF to Excel remains legible, although its grid is the densest member and should not be made smaller than 20px.
- PDF Merge reads immediately as multiple documents, but can also imply copy/version history without its label.
- Image Resizer and Percentage remain the most immediately familiar.

## E. Tool-card light/dark mocks

- `comparison/card-context-light.png`
- `comparison/card-context-dark.png`

Both show all six icons in the current standard and featured card proportions. The icon uses the current semantic brand foreground treatment rather than a per-tool hard-coded colour.

## F. Related Tools mock

`comparison/related-tools-context.png` shows all six at 22px in compact light and dark rows.

## G. Accessibility assessment

- In cards and Related Tools rows, icons are decorative because a visible tool name is adjacent.
- Production SVG wrappers should use `aria-hidden="true"` and `focusable="false"`.
- Icons must not be separate links, buttons, or keyboard stops.
- The full-card link and its visible name remain the accessible meaning.
- No icon-only navigation is proposed.
- Colour is not used to distinguish tools or categories.

## H. Scoring table

Scores are 1-5. They are review signals, not an automatic ranking.

| Icon | Recognisable 20-24px | ToolNest identity | Family consistency | Low ambiguity | Low density | Light/dark | Beside text |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Document Privacy | 4 | 5 | 4 | 4 | 4 | 5 | 5 |
| PDF to Excel | 4 | 5 | 4 | 4 | 3 | 5 | 5 |
| Searchable PDF | 4 | 5 | 4 | 4 | 4 | 5 | 5 |
| PDF Merge | 4 | 3 | 5 | 3 | 4 | 5 | 5 |
| Image Resizer | 5 | 3 | 5 | 4 | 4 | 5 | 5 |
| Percentage Calculator | 5 | 3 | 5 | 5 | 5 | 5 | 5 |

Uncertainty remains around two unlabeled readings: FileStack may mean copy/version rather than merge, and the document-grid symbol communicates structured table data more strongly than the direction of extraction. The adjacent tool name resolves both in the intended UI.

## I. Ambiguity findings and special review questions

1. **Do custom icons belong beside the standard icons?** Yes at 24px and 22px. Stroke weight, caps, corner radii, safe zone, and density are coherent. PDF to Excel is the visual-density ceiling.
2. **Can Document Privacy be distinguished from Searchable PDF?** Yes. Privacy uses a round external lens; Searchable PDF uses an internal rectangular scan/text layer. Their silhouettes remain different at 20px.
3. **Does PDF to Excel communicate table extraction without Excel branding?** It clearly communicates document plus structured table data. Extraction direction is implied by overlap, not by an extra arrow, which keeps density controlled.
4. **Are Merge, Resize, and Percentage familiar without labels?** Resize and Percentage are strong. Merge is recognisable as multiple documents but has some copy/version ambiguity.
5. **Is this calmer than the current text tokens?** Yes. One stroke grammar removes the visual jump between abbreviations, single letters, and punctuation.
6. **Could ToolNest look like a generic Lucide demo?** Yes if every tool uses an unmodified library icon. Limiting custom work to semantically complex workflows avoids that.
7. **What custom grammar creates identity?** A restrained source-object plus one workflow-specific modifier: lens for inspection, overlap for structured transformation, and scan-frame corners for OCR/text-layer work. This adds identity without changing stroke, colour, or accessibility rules.

## J. Recommended system rules

1. Use a 24x24 viewBox, 2px centered stroke, round caps and joins.
2. Keep geometry inside the 1px safe zone and maintain roughly 2px between distinct elements.
3. Use `fill="none"` and `stroke="currentColor"`; size and colour come from the surrounding component.
4. Use one primary object and at most one semantic modifier.
5. Prefer a Lucide icon when a familiar action is already clear.
6. Create a local custom icon only when the tool's job is more specific than a standard metaphor.
7. Never encode category with hard-coded SVG colour.
8. Avoid product letters, vendor logos, shields, locks, checks, gradients, shadows, and decorative fills.
9. Review every icon at actual 20px, 24px, and 32px sizes, in monochrome, and in light/dark contexts.
10. Keep the visible tool name adjacent; icons remain decorative.

## K. Should lucide-react be installed?

**Recommendation: yes, but only after owner approval of this grammar.** Install one pinned production dependency, import approved icons individually, and keep all custom icons local. There should be no CDN, runtime fetch, remote font, or dynamic icon-name loader.

The dependency is justified only if the final 25-tool inventory reuses enough standard icons to avoid maintaining copied SVG paths. If the approved inventory uses very few standards, local reviewed SVG components may be the smaller dependency surface.

## L. Proposed production architecture

This is a proposal only; it is not implemented in this bake-off.

```ts
type ToolIconKey =
  | "document-privacy"
  | "pdf-to-excel"
  | "searchable-pdf"
  | "pdf-merge"
  | "image-resizer"
  | "percentage-calculator";

type Tool = {
  // Existing fields...
  iconKey: ToolIconKey;
};
```

- `components/icons/tool-icon.tsx`: one `ToolIcon` wrapper that applies size, `currentColor`, `aria-hidden`, and `focusable=false`.
- `components/icons/custom/`: local ToolNest SVG components.
- A static icon registry maps each `ToolIconKey` to either an individually imported Lucide component or a local custom component.
- `ToolCard`, `CategoryCard`, and `RelatedTools` receive the key through tool data and render the same wrapper.
- Avoid free-form icon strings, dynamic package imports, and per-card SVG duplication.

## Review asset index

- `comparison/icon-system-board.png`
- `comparison/card-context-light.png`
- `comparison/card-context-dark.png`
- `comparison/related-tools-context.png`
- `comparison/size-comparison.png`
- `comparison/mono-comparison.png`

All SVG masters use `currentColor`; the PNG mocks apply ToolNest's current light and dark semantic brand treatments for review.
