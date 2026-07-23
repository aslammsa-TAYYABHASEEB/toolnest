# ToolNest

ToolNest is a mobile-first collection of fast, approachable everyday browser tools. The foundation includes navigation, discovery, reusable interface components, theme support, accessibility, and SEO-ready routes. Image Converter and Image Compressor both run locally in the browser.

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

## Technology stack

- [Next.js 15](https://nextjs.org/) with the App Router
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) in strict mode
- [Tailwind CSS 4](https://tailwindcss.com/) with semantic CSS design tokens
- Native browser APIs for theme preference; no theme package is required

## Local installation

Requirements:

- Node.js 20 or newer
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
  ui/                 Reusable UI primitives
  category-card.tsx   Category discovery card
  tool-card.tsx       Coming-soon tool card
  site-header.tsx     Responsive site navigation
  site-footer.tsx     Shared footer
  theme-toggle.tsx    System/light/dark preference control
lib/
  site.ts             Site configuration, categories, and planned tools
  cn.ts               Lightweight class-name helper
```

## Current limitations

- Image Converter and Image Compressor are available; all unfinished tools are marked **Coming soon**.
- No PDF, text, calculator, video, audio, OCR, QR, AI, or other processing logic exists.
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
