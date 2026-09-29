# ToolNest production tool-icon mapping

This mapping was frozen before editing `lib/site.ts`.

## Tool mapping

| # | Tool | Semantic key | Source | Component / custom file | Rationale |
| ---: | --- | --- | --- | --- | --- |
| 1 | PDF Sanitizer & Privacy Checker | `document-privacy` | CUSTOM | `DocumentPrivacyIcon` | A document and inspection lens describe structural review without promising safety. |
| 2 | Searchable OCR PDF | `searchable-pdf` | CUSTOM | `SearchablePdfIcon` | Scan-frame corners around text distinguish OCR text-layer creation from privacy inspection. |
| 3 | PDF to Excel | `pdf-to-excel` | CUSTOM | `PdfToExcelIcon` | A neutral table overlaps its source document without Excel branding. |
| 4 | Image to Text | `image-to-text` | CUSTOM | `ImageToTextIcon` | An image source transitions to plain text lines without OCR lettering. |
| 5 | Organize PDF | `organize-pdf` | LUCIDE | `LayoutGrid` | A familiar grid communicates visual page arrangement. |
| 6 | PDF Merge | `pdf-merge` | LUCIDE | `FileStack` | A document stack is the familiar multi-file combine metaphor. |
| 7 | PDF Split | `pdf-split` | LUCIDE | `Scissors` | Scissors communicate separation without text abbreviations. |
| 8 | JPG to PDF | `jpg-to-pdf` | LUCIDE | `FileInput` | The arrow entering a document communicates source material becoming a PDF. |
| 9 | PDF to JPG | `pdf-to-jpg` | LUCIDE | `FileOutput` | The arrow leaving a document communicates exported page images. |
| 10 | PDF Rotate | `pdf-rotate` | LUCIDE | `RotateCw` | Universal clockwise rotation metaphor. |
| 11 | PDF Watermark | `pdf-watermark` | LUCIDE | `Stamp` | Familiar marking/stamping action without letters or a vendor mark. |
| 12 | PDF Page Numbers | `pdf-page-numbers` | LUCIDE | `ListOrdered` | Ordered numbering communicates sequential page labels. |
| 13 | Compress PDF | `pdf-compress` | LUCIDE | `Minimize2` | Inward diagonal corners communicate reduction. |
| 14 | PDF to Word | `pdf-to-word` | LUCIDE | `FileText` | Editable document text without a Microsoft W. |
| 15 | Image Resizer | `image-resize` | LUCIDE | `ImageUpscale` | Familiar image plus outward scaling action. |
| 16 | Image Compressor | `image-compress` | LUCIDE | `ImageDown` | Image plus reduction direction, distinct from resizing. |
| 17 | Image Converter | `image-convert` | LUCIDE | `RefreshCw` | Circular change action communicates format conversion. |
| 18 | Word Counter | `word-counter` | LUCIDE | `TextSearch` | Text inspection/counting without reusing ordered-list imagery. |
| 19 | QR Code Generator | `qr-code` | LUCIDE | `QrCode` | Directly familiar QR pattern. |
| 20 | JSON Formatter & Validator | `json-formatter` | LUCIDE | `Braces` | Familiar structured-data syntax. |
| 21 | Case Converter | `case-converter` | LUCIDE | `CaseSensitive` | Familiar upper/lower-case typography concept. |
| 22 | Remove Extra Spaces | `remove-extra-spaces` | LUCIDE | `RemoveFormatting` | Text cleanup without a paragraph-token abbreviation. |
| 23 | Percentage Calculator | `percentage-calculator` | LUCIDE | `Percent` | Direct mathematical convention. |
| 24 | Age Calculator | `age-calculator` | LUCIDE | `CalendarDays` | Date-based duration calculation. |
| 25 | Unit Converter | `unit-converter` | LUCIDE | `Ruler` | Familiar physical measurement and scale metaphor. |

## Category mapping

| Category | Semantic key | Source | Component | Rationale |
| --- | --- | --- | --- | --- |
| PDF Tools | `category-pdf` | LUCIDE | `Files` | Broad multi-document category without a PDF abbreviation. |
| Image Tools | `category-image` | LUCIDE | `Image` | Familiar picture category. |
| Text Tools | `category-text` | LUCIDE | `Type` | Familiar text/typography category. |
| Calculators | `category-calculators` | LUCIDE | `Calculator` | Direct calculator category. |

## Counts

- Tools: 25
- Lucide tools: 21
- Custom tools: 4
- Lucide categories: 4
- Custom categories: 0
