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
};

export type Category = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  accent: string;
};

export const categories: Category[] = [
  {
    slug: "pdf-tools",
    name: "PDF Tools",
    shortName: "PDF",
    description: "Organize, convert, and prepare PDF documents with ease.",
    icon: "PDF",
    accent: "coral",
  },
  {
    slug: "image-tools",
    name: "Image Tools",
    shortName: "Images",
    description: "Resize, compress, and convert your everyday images.",
    icon: "IMG",
    accent: "violet",
  },
  {
    slug: "text-tools",
    name: "Text Tools",
    shortName: "Text",
    description: "Clean, count, format, and transform written content.",
    icon: "TXT",
    accent: "blue",
  },
  {
    slug: "calculators",
    name: "Calculators",
    shortName: "Calculate",
    description: "Quick calculators for work, study, and daily decisions.",
    icon: "123",
    accent: "green",
  },
];

export const tools: Tool[] = [
  { name: "PDF Merge", description: "Combine multiple PDF files privately in the order you choose.", category: "pdf-tools", icon: "M", popular: true, available: true, href: "/tools/pdf-merge" },
  { name: "PDF Split", description: "Extract pages or divide a PDF into private browser downloads.", category: "pdf-tools", icon: "S", popular: true, available: true, href: "/tools/pdf-split" },
  { name: "JPG to PDF", description: "Turn ordered JPG, PNG, and WebP images into one private PDF.", category: "pdf-tools", icon: "J", popular: true, available: true, href: "/tools/jpg-to-pdf" },
  { name: "PDF to JPG", description: "Render PDF pages as private JPG or PNG image downloads.", category: "pdf-tools", icon: "I", popular: true, available: true, href: "/tools/pdf-to-jpg" },
  { name: "PDF Rotate", description: "Rotate all or selected PDF pages without flattening their content.", category: "pdf-tools", icon: "R", popular: true, available: true, href: "/tools/pdf-rotate" },
  { name: "Compress PDF", description: "Reduce PDF file size while keeping it readable.", category: "pdf-tools", icon: "C", popular: true, available: true, href: "/tools/pdf-compress" },
  { name: "PDF to Word", description: "Convert PDF text to a downloadable Word document privately in your browser.", category: "pdf-tools", icon: "W", available: true, href: "/tools/pdf-to-word" },
  { name: "Image Resizer", description: "Resize JPG, PNG, and WebP images privately by pixels or percentage.", category: "image-tools", icon: "R", popular: true, available: true, href: "/tools/image-resizer" },
  { name: "Image Compressor", description: "Reduce JPG, PNG, and WebP file sizes privately in your browser.", category: "image-tools", icon: "C", popular: true, available: true, href: "/tools/image-compressor" },
  { name: "Image Converter", description: "Convert JPG, PNG, and WebP images privately in your browser.", category: "image-tools", icon: "↻", available: true, href: "/tools/image-converter" },
  { name: "Word Counter", description: "Count words, characters, sentences, and reading time.", category: "text-tools", icon: "W", popular: true, available: true, href: "/tools/word-counter" },
  { name: "QR Code Generator", description: "Create customizable QR codes for text, links, Wi-Fi, messages, and contacts.", category: "text-tools", icon: "QR", popular: true, available: true, href: "/tools/qr-code-generator" },
  { name: "JSON Formatter & Validator", description: "Format, minify, and validate JSON privately in your browser.", category: "text-tools", icon: "{}", popular: true, available: true, href: "/tools/json-formatter" },
  { name: "Case Converter", description: "Switch text between uppercase and lowercase styles.", category: "text-tools", icon: "Aa", available: true, href: "/tools/case-converter" },
  { name: "Remove Extra Spaces", description: "Clean repeated spaces and untidy line breaks.", category: "text-tools", icon: "¶", available: true, href: "/tools/remove-extra-spaces" },
  { name: "Percentage Calculator", description: "Solve common percentage questions quickly.", category: "calculators", icon: "%", popular: true, available: true, href: "/tools/percentage-calculator" },
  { name: "Age Calculator", description: "Calculate age between two selected dates.", category: "calculators", icon: "A" },
  { name: "Unit Converter", description: "Convert common length, weight, and temperature units.", category: "calculators", icon: "⇄" },
];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getToolsByCategory(slug: string) {
  return tools.filter((tool) => tool.category === slug);
}
