import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolCard } from "@/components/tool-card";
import { PageHeader } from "@/components/ui/page-header";
import { categories, getCategory, getToolsByCategory, siteConfig } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

const categorySeo: Record<string, { title: string; description: string }> = {
  "pdf-tools": {
    title: "PDF Tools – Merge, Split, Convert & Compress PDFs",
    description: "Free browser-based PDF tools to merge, split, rotate, compress, and convert PDF files. Process supported documents on your device without a conversion server upload.",
  },
  "image-tools": {
    title: "Image Tools – Resize, Compress & Convert Images",
    description: "Free online image tools to resize, compress, and convert JPG, PNG, and WebP files directly in your browser with privacy-first processing.",
  },
  "text-tools": {
    title: "Text Tools – Count, Format & Clean Text Online",
    description: "Free browser-based text tools for word counting, JSON formatting, QR codes, case conversion, and whitespace cleanup without sending your text to a processing server.",
  },
  calculators: {
    title: "Online Calculators – Percentage, Age & Unit Conversion",
    description: "Free online calculators for percentages, exact age, and common length, weight, and temperature conversions with instant browser-side results.",
  },
};

export function generateStaticParams() {
  return categories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return {};
  const seo = categorySeo[category.slug] ?? {
    title: category.name,
    description: `${category.description} Browse the ${category.name.toLowerCase()} collection on ToolNest.`,
  };
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: {
      title: `${seo.title} | ${siteConfig.name}`,
      description: seo.description,
      url: `/categories/${category.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${seo.title} | ${siteConfig.name}`,
      description: seo.description,
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  const categoryTools = getToolsByCategory(category.slug);
  const availableTools = categoryTools.filter((tool) => tool.available);

  return (
    <>
      <PageHeader title={category.name} description={category.description} eyebrow="Tool category" accent={category.accent} icon={category.icon} />
      <section className="section category-page">
        <div className="container-app">
          <div className="section-heading compact"><div><h2>{category.shortName} tools</h2></div><p>{availableTools.length} free tools ready to use.</p></div>
          <div className="tool-grid">{availableTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
          <aside className="category-summary">
            <span className="category-icon" aria-hidden="true">{category.icon}</span>
            <div><h2>{category.privateHeading}</h2><p>{category.availableDescription}</p></div>
          </aside>
        </div>
      </section>
    </>
  );
}
