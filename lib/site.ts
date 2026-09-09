const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const siteUrl = configuredSiteUrl
  ? new URL(configuredSiteUrl).toString().replace(/\/$/, "")
  : "https://toolnest.example";

export const siteConfig = {
  name: "ToolNest",
  description: "Simple, fast online tools for everyday files, images, text, and calculations.",
  url: siteUrl,
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? "",
  isProductionConfigured: Boolean(
    configuredSiteUrl
    && process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim(),
  ),
};

export type Tool = {
  name: string;
  description: string;
  category: string;
  icon: string;
  popular?: boolean;
  available?: boolean;
  href?: string;
  keywords?: string[];
  relatedHrefs?: string[];
};

export type Category = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  privateHeading: string;
  availableDescription: string;
  icon: string;
  accent: string;
};

export const categories: Category[] = [
  {
    slug: "pdf-tools",
    name: "PDF Tools",
    shortName: "PDF",
    description: "Organize, convert, and prepare PDF documents with ease.",
    privateHeading: "Work with PDFs privately",
    availableDescription: "Merge, split, rotate, compress, watermark, number, and convert PDF files directly in your browser. ToolNest keeps supported document processing on your device.",
    icon: "PDF",
    accent: "coral",
  },
  {
    slug: "image-tools",
    name: "Image Tools",
    shortName: "Image",
    description: "Resize, compress, and convert your everyday images.",
    privateHeading: "Work with images privately",
    availableDescription: "Image Resizer, Image Compressor, and Image Converter handle JPG, PNG, and WebP entirely on your device.",
    icon: "IMG",
    accent: "violet",
  },
  {
    slug: "text-tools",
    name: "Text Tools",
    shortName: "Text",
    description: "Clean, count, format, and transform written content.",
    privateHeading: "Work with text privately",
    availableDescription: "Count and clean writing, change letter case, format JSON, and create QR codes directly in your browser without sending text to a processing server.",
    icon: "TXT",
    accent: "blue",
  },
  {
    slug: "calculators",
    name: "Calculators",
    shortName: "Calculator",
    description: "Quick calculators for work, study, and daily decisions.",
    privateHeading: "Calculate privately",
    availableDescription: "Percentage, age, and unit calculations run instantly in your browser without sending your values anywhere.",
    icon: "123",
    accent: "green",
  },
];

export const tools: Tool[] = [
  { name: "PDF Merge", description: "Combine multiple PDF files privately in the order you choose.", category: "pdf-tools", icon: "M", popular: true, available: true, href: "/tools/pdf-merge", keywords: ["merge pdf", "combine pdf files", "join pdf"], relatedHrefs: ["/tools/pdf-split", "/tools/pdf-compress", "/tools/pdf-page-numbers"] },
  { name: "PDF Split", description: "Extract pages or divide a PDF into private browser downloads.", category: "pdf-tools", icon: "S", popular: true, available: true, href: "/tools/pdf-split", keywords: ["split pdf", "extract pdf pages", "separate pdf pages"], relatedHrefs: ["/tools/pdf-merge", "/tools/pdf-rotate", "/tools/pdf-page-numbers"] },
  { name: "JPG to PDF", description: "Turn ordered JPG, PNG, and WebP images into one private PDF.", category: "pdf-tools", icon: "J", popular: true, available: true, href: "/tools/jpg-to-pdf", keywords: ["jpg to pdf", "image to pdf", "png to pdf"], relatedHrefs: ["/tools/image-converter", "/tools/pdf-merge", "/tools/pdf-compress"] },
  { name: "PDF to JPG", description: "Render PDF pages as private JPG or PNG image downloads.", category: "pdf-tools", icon: "I", popular: true, available: true, href: "/tools/pdf-to-jpg", keywords: ["pdf to jpg", "pdf to image", "convert pdf to png"], relatedHrefs: ["/tools/image-compressor", "/tools/image-converter", "/tools/jpg-to-pdf"] },
  { name: "PDF Rotate", description: "Rotate all or selected PDF pages without flattening their content.", category: "pdf-tools", icon: "R", popular: true, available: true, href: "/tools/pdf-rotate", keywords: ["rotate pdf", "turn pdf pages", "fix pdf orientation"], relatedHrefs: ["/tools/pdf-split", "/tools/pdf-merge", "/tools/pdf-page-numbers"] },
  { name: "PDF Watermark", description: "Add text, image, or logo watermarks to PDF pages privately in your browser.", category: "pdf-tools", icon: "WM", available: true, href: "/tools/pdf-watermark", keywords: ["pdf watermark", "add watermark to pdf", "logo watermark pdf", "image watermark pdf"], relatedHrefs: ["/tools/pdf-page-numbers", "/tools/pdf-split", "/tools/pdf-rotate"] },
  { name: "PDF Page Numbers", description: "Add customizable page numbers to all or selected PDF pages privately in your browser.", category: "pdf-tools", icon: "#", available: true, href: "/tools/pdf-page-numbers", keywords: ["page numbers", "pdf page numbers", "number pdf", "add page numbers to pdf", "pdf page numbering", "page 1 of 10 pdf"], relatedHrefs: ["/tools/pdf-watermark", "/tools/pdf-split", "/tools/pdf-rotate"] },
  { name: "Compress PDF", description: "Reduce PDF file size while keeping it readable.", category: "pdf-tools", icon: "C", popular: true, available: true, href: "/tools/pdf-compress", keywords: ["compress pdf", "reduce pdf size", "make pdf smaller"], relatedHrefs: ["/tools/pdf-merge", "/tools/pdf-split", "/tools/pdf-to-word"] },
  { name: "PDF to Word", description: "Convert PDF text to a downloadable Word document privately in your browser.", category: "pdf-tools", icon: "W", available: true, href: "/tools/pdf-to-word", keywords: ["pdf to word", "pdf to docx", "convert pdf to editable word"], relatedHrefs: ["/tools/pdf-to-jpg", "/tools/pdf-split", "/tools/pdf-compress"] },
  { name: "Image Resizer", description: "Resize JPG, PNG, and WebP images privately by pixels or percentage.", category: "image-tools", icon: "R", popular: true, available: true, href: "/tools/image-resizer", keywords: ["resize image", "change image dimensions", "resize jpg png webp"], relatedHrefs: ["/tools/image-compressor", "/tools/image-converter", "/tools/jpg-to-pdf"] },
  { name: "Image Compressor", description: "Reduce JPG, PNG, and WebP file sizes privately in your browser.", category: "image-tools", icon: "C", popular: true, available: true, href: "/tools/image-compressor", keywords: ["compress image online", "reduce image size", "compress jpg png webp"], relatedHrefs: ["/tools/image-resizer", "/tools/image-converter", "/tools/pdf-to-jpg"] },
  { name: "Image Converter", description: "Convert JPG, PNG, and WebP images privately in your browser.", category: "image-tools", icon: "↻", available: true, href: "/tools/image-converter", keywords: ["image converter", "convert jpg png webp", "change image format"], relatedHrefs: ["/tools/image-resizer", "/tools/image-compressor", "/tools/jpg-to-pdf"] },
  { name: "Word Counter", description: "Count words, characters, sentences, and reading time.", category: "text-tools", icon: "W", popular: true, available: true, href: "/tools/word-counter", keywords: ["word counter", "character counter", "count words online"], relatedHrefs: ["/tools/case-converter", "/tools/remove-extra-spaces", "/tools/json-formatter"] },
  { name: "QR Code Generator", description: "Create customizable QR codes for text, links, Wi-Fi, messages, and contacts.", category: "text-tools", icon: "QR", popular: true, available: true, href: "/tools/qr-code-generator", keywords: ["qr code generator", "create qr code", "wifi qr code"], relatedHrefs: ["/tools/json-formatter", "/tools/word-counter"] },
  { name: "JSON Formatter & Validator", description: "Format, minify, and validate JSON privately in your browser.", category: "text-tools", icon: "{}", popular: true, available: true, href: "/tools/json-formatter", keywords: ["json formatter", "json validator", "beautify json"], relatedHrefs: ["/tools/case-converter", "/tools/remove-extra-spaces", "/tools/word-counter"] },
  { name: "Case Converter", description: "Switch text between uppercase and lowercase styles.", category: "text-tools", icon: "Aa", available: true, href: "/tools/case-converter", keywords: ["case converter", "uppercase lowercase converter", "title case converter"], relatedHrefs: ["/tools/remove-extra-spaces", "/tools/word-counter", "/tools/json-formatter"] },
  { name: "Remove Extra Spaces", description: "Clean repeated spaces and untidy line breaks.", category: "text-tools", icon: "¶", available: true, href: "/tools/remove-extra-spaces", keywords: ["remove extra spaces", "clean whitespace", "remove blank lines"], relatedHrefs: ["/tools/case-converter", "/tools/word-counter", "/tools/json-formatter"] },
  { name: "Percentage Calculator", description: "Solve common percentage questions quickly.", category: "calculators", icon: "%", popular: true, available: true, href: "/tools/percentage-calculator", keywords: ["percentage calculator", "percent change calculator", "calculate percentage"], relatedHrefs: ["/tools/age-calculator", "/tools/unit-converter"] },
  { name: "Age Calculator", description: "Calculate exact age in years, months, and days from date of birth.", category: "calculators", icon: "A", popular: true, available: true, href: "/tools/age-calculator", keywords: ["age calculator", "calculate exact age", "date of birth calculator"], relatedHrefs: ["/tools/percentage-calculator", "/tools/unit-converter"] },
  { name: "Unit Converter", description: "Convert common length, weight, and temperature units.", category: "calculators", icon: "⇄", popular: true, available: true, href: "/tools/unit-converter", keywords: ["unit converter", "metric imperial converter", "length weight temperature converter"], relatedHrefs: ["/tools/percentage-calculator", "/tools/age-calculator"] },
];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getToolsByCategory(slug: string) {
  return tools.filter((tool) => tool.category === slug);
}

export function getRelatedTools(href: string) {
  const relatedHrefs = tools.find((tool) => tool.href === href)?.relatedHrefs ?? [];
  return relatedHrefs
    .map((relatedHref) => tools.find((tool) => tool.href === relatedHref))
    .filter((tool): tool is Tool => Boolean(tool?.available && tool.href));
}
