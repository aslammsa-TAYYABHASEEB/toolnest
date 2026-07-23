# ToolNest

ToolNest is a mobile-first collection of fast, approachable everyday browser tools. The foundation includes navigation, discovery, reusable interface components, theme support, accessibility, and SEO-ready routes. PDF Rotate, PDF to JPG, JPG to PDF, PDF Merge, PDF Split, Image Converter, Image Compressor, and Image Resizer all run locally in the browser.

## Project status

### Sprint 1 — Site foundation

- Next.js App Router project structure
- Mobile-first homepage
- PDF, image, text, and calculator category pages
- Reusable tool and category cards
- Responsive navigation and footer
- Privacy Policy, Terms of Use, Disclaimer, and Contact placeholders
- Static metadata, sitemap, robots.txt, and custom not-found page

### Sprint 2 — Design system and UI foundation

- Semantic tokens for colors, typography, spacing, radius, shadows, and motion
- Light, dark, and system themes with a saved browser preference
- Reusable buttons, inputs, search, badges, cards, empty states, page headers, and icon buttons
- UI-only upload dropzone and contact-form previews
- Refined homepage, navigation, category, legal, contact, and footer layouts
- Accessible focus states, reduced-motion support, and responsive 1/2/4-column grids
- Clearly labeled space reserved for a future advertising placement

### Sprint 3 — Image Converter

- Browser-only JPG, PNG, and WebP conversion at `/tools/image-converter`
- Drag-and-drop or file selection, preview, source details, quality control, and download
- Transparency preservation for PNG/WebP and a white background for JPG output
- File signature validation, a 20 MB limit, clear errors, and object URL cleanup

### Sprint 4 — Image Compressor

- Browser-only JPG, PNG, and WebP compression at `/tools/image-compressor`
- Quality controls for lossy JPG and WebP output with original dimensions retained
- Honest lossless PNG re-encoding with clear limitation and no-savings states
- Before-and-after sizes, saved bytes and percentage, repeat compression, and download
- Shared Sprint 3 image validation, decoding, encoding, and memory-cleanup utilities

### Sprint 4.5 — Shared image engine

- Shared uploader, preview, file information, processing, result, and download components
- Reusable validation, browser capability, decoding, filename, download, and object URL utilities
- Common processing state, result, and error models for browser image tools

### Sprint 5 — Image Resizer

- Browser-only JPG, PNG, and WebP resizing at `/tools/image-resizer`
- Exact pixel dimensions, percentage scaling presets, and a default aspect ratio lock
- Target-dimension preview, format and quality controls, and before-and-after details
- Safe 16,384-pixel side and 64-megapixel output limits to reduce canvas memory failures
- Transparency preservation for PNG/WebP and a white background for JPG output

### Sprint 6 — PDF Merge

- Browser-only multi-file PDF merging at `/tools/pdf-merge`
- Drag-and-drop selection and ordering with accessible keyboard reorder controls
- PDF signature, corruption, encryption, and 100 MB combined-size validation
- Per-file names, sizes, page counts, order numbers, removal, and clear-all actions
- Reusable browser PDF engine for validation, loading, metadata, merging, downloads, capabilities, filenames, errors, and types

### Sprint 7 — PDF Split

- Browser-only selected-page extraction, per-page splitting, and range splitting at `/tools/pdf-split`
- Live page-expression validation with reverse-range normalization, deduplication, document ordering, and overlap checks
- Individual PDF downloads plus local ZIP packaging with `fflate` 0.8.3
- 100 MB input, 1,000 source-page, 200 output-file, and 500 copied-page safety limits
- Shared PDF parsing, splitting, filenames, result URL lifecycle, errors, and ZIP utilities

### Sprint 8 — JPG to PDF

- Browser-only JPG, PNG, and WebP to PDF conversion at `/tools/jpg-to-pdf`
- Multiple-image selection, thumbnails, metadata, ordering, removal, and repeat conversion
- Auto, A4, Letter, and Legal pages with orientation, Fit, Fill, Original, margins, and background controls
- Direct JPG/PNG embedding with local WebP-to-PNG preparation and explicit transparency backgrounds
- 20 MB per-image, 100 MB total, 100-image, 64-megapixel per-image, 160-megapixel combined, and 200 MB output limits

### Sprint 9 — PDF to JPG

- Browser-only PDF page rendering to JPG or PNG at `/tools/pdf-to-jpg`
- All-page, selected-page, and range modes with shared expression parsing
- JPG quality, 1× to 3× render scale, live output planning, thumbnails, individual downloads, and ZIP packaging
- 100 MB input, 1,000 source-page, 100 output-image, 8,192-pixel dimension, and 120-megapixel workload limits
- Mozilla PDF.js rendering with sequential canvas processing and temporary URL cleanup

### Sprint 10 â€” PDF Rotate

- Browser-only PDF page rotation at `/tools/pdf-rotate`
- All-page, page-expression, and individual-card selection with synchronized controls
- Clockwise, counter-clockwise, 180-degree, and reset actions with original, pending, and effective orientation details
- pdf-lib metadata rotation preserves page order, dimensions, selectable text, and vector graphics
- PDF.js renders up to 40 compact sequential thumbnails while all-page rotation supports documents up to 500 pages
- Password-protected PDFs are unsupported; large documents remain subject to browser memory, and saving changes may invalidate existing digital signatures

## Technology stack

- [Next.js 15](https://nextjs.org/) with the App Router
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) in strict mode
- [Tailwind CSS 4](https://tailwindcss.com/) with semantic CSS design tokens
- Native browser APIs for theme preference; no theme package is required

## Local installation

Requirements:

- Node.js 20.19 or newer
- npm

Clone the intended repository, then install the locked dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Open `http://localhost:3000` in a browser.

## Development commands

```bash
# Start the development server
npm run dev

# Run the TypeScript compiler without emitting files
npm run typecheck

# Create an optimized production build
npm run build

# Serve the previously created production build
npm run start
```

Before committing a change, run both:

```bash
npm run typecheck
npm run build
```

## Project structure

```text
app/
  categories/[slug]/  Static category routes
  contact/            Contact placeholder
  disclaimer/         Disclaimer placeholder
  privacy-policy/     Privacy Policy placeholder
  terms/              Terms of Use placeholder
  globals.css         Global component and responsive styles
  tokens.css          Light/dark semantic design tokens
  layout.tsx          Shared metadata, theme bootstrap, header, and footer
  page.tsx            Homepage
  robots.ts           Search crawler rules
  sitemap.ts          Static sitemap generation
components/
  image-tool/         Shared browser image tool components
  image-resizer.tsx   Image Resizer interface and workflow
  jpg-to-pdf.tsx      JPG to PDF interface and workflow
  pdf-to-jpg.tsx      PDF to JPG/PNG interface and workflow
  pdf-rotate.tsx      PDF Rotate interface and workflow
  pdf-tool/           Shared browser PDF tool components
  pdf-merge.tsx       PDF Merge interface and workflow
  pdf-split.tsx       PDF Split interface and workflow
  ui/                 Reusable UI primitives
  category-card.tsx   Category discovery card
  tool-card.tsx       Coming-soon tool card
  site-header.tsx     Responsive site navigation
  site-footer.tsx     Shared footer
  theme-toggle.tsx    System/light/dark preference control
lib/
  image/              Shared browser image validation and processing engine
  pdf/                Shared browser PDF validation and processing engine
  site.ts             Site configuration, categories, and planned tools
  cn.ts               Lightweight class-name helper
```

## Current limitations

- PDF Rotate, PDF to JPG, JPG to PDF, PDF Merge, PDF Split, Image Converter, Image Compressor, and Image Resizer are available; all unfinished tools are marked **Coming soon**.
- No PDF organize/delete, text, calculator, video, audio, OCR, QR, AI, or other processing logic exists.
- Category upload previews, search, and contact controls remain interface previews only.
- There is no backend, database, API, authentication, payment flow, or account system.
- Legal copy is placeholder content and requires appropriate review before a public launch.
- `siteConfig.url` uses a placeholder domain and must be updated before deployment.

## Privacy-first processing direction

Where practical, future tools should process user files and text locally in the browser. This direction can reduce uploads, improve responsiveness, and keep sensitive material on the user's device. Each future tool must document whether processing is fully local or requires a network request before it is released.

Browser-side processing is a product direction, not a promise that every future feature can operate locally. Any feature that eventually requires server processing must receive an explicit privacy and security review, clear user-facing disclosure, appropriate retention rules, and completed legal documentation.

## Repository safety

- Environment files, dependencies, build output, logs, caches, and temporary workspace files are excluded from Git.
- Do not commit secrets or real user files.
- Verify the Git remote before pushing: `git remote -v`.
- This project should only be connected to the confirmed ToolNest repository.
