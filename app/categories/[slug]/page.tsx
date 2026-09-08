import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolCard } from "@/components/tool-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { UploadDropzone } from "@/components/ui/upload-dropzone";
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
  const hasAvailableTools = availableTools.length > 0;

  return (
    <>
      <PageHeader title={category.name} description={category.description} eyebrow="Tool category" accent={category.accent} icon={category.icon} />
      <section className="section">
        <div className="container">
          <div className="section-heading compact"><div><h2>{category.shortName} tools</h2></div><p>{categoryTools.length} useful tools in the ToolNest collection.</p></div>
          <div className="tool-grid">{categoryTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
          <div className="category-preview-grid">
            {!hasAvailableTools && <UploadDropzone />}
            <aside className="coming-soon-panel">
              <Badge tone={hasAvailableTools ? "success" : "brand"}>
                {hasAvailableTools
                  ? `${availableTools.length} ${availableTools.length === 1 ? "tool" : "tools"} available`
                  : "More tools planned"}
              </Badge>
              <h2>{hasAvailableTools ? category.privateHeading : "Tools are coming soon"}</h2>
              <p>{hasAvailableTools ? category.availableDescription : "This category is still in preview. No files or data are processed here."}</p>
              {hasAvailableTools ? (
                <div className="category-tool-actions">
                  {availableTools.map((tool, index) => (
                    <Button
                      key={tool.name}
                      href={tool.href ?? `/categories/${category.slug}`}
                      variant={index === 0 ? "primary" : "secondary"}
                      size="sm"
                    >
                      Open {tool.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button href="/#categories" variant="secondary" size="sm">Back to all categories</Button>
              )}
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
