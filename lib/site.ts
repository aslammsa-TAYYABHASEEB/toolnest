export const siteConfig = {
  name: "ToolNest",
  description: "Simple, fast online tools for everyday files, images, text, and calculations.",
  url: "https://toolnest.example",
};

export type Tool = {
  name: string;
  description: string;
  category: string;
  icon: string;
  popular?: boolean;
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
  { name: "Merge PDF", description: "Combine multiple PDF files into one document.", category: "pdf-tools", icon: "M", popular: true },
  { name: "Compress PDF", description: "Reduce PDF file size while keeping it readable.", category: "pdf-tools", icon: "C", popular: true },
  { name: "PDF to Word", description: "Prepare PDF documents for Word conversion.", category: "pdf-tools", icon: "W" },
  { name: "Resize Image", description: "Set custom image dimensions in a few steps.", category: "image-tools", icon: "R", popular: true },
  { name: "Compress Image", description: "Make images smaller for faster sharing.", category: "image-tools", icon: "C" },
  { name: "Convert Image", description: "Prepare JPG, PNG, and WebP format conversions.", category: "image-tools", icon: "↻" },
  { name: "Word Counter", description: "Count words, characters, sentences, and reading time.", category: "text-tools", icon: "W", popular: true },
  { name: "Case Converter", description: "Switch text between uppercase and lowercase styles.", category: "text-tools", icon: "Aa" },
  { name: "Remove Extra Spaces", description: "Clean repeated spaces and untidy line breaks.", category: "text-tools", icon: "¶" },
  { name: "Percentage Calculator", description: "Solve common percentage questions quickly.", category: "calculators", icon: "%", popular: true },
  { name: "Age Calculator", description: "Calculate age between two selected dates.", category: "calculators", icon: "A" },
  { name: "Unit Converter", description: "Convert common length, weight, and temperature units.", category: "calculators", icon: "⇄" },
];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getToolsByCategory(slug: string) {
  return tools.filter((tool) => tool.category === slug);
}
