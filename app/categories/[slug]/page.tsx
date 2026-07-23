import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolCard } from "@/components/tool-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { UploadDropzone } from "@/components/ui/upload-dropzone";
import { categories, getCategory, getToolsByCategory } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return categories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return {};
  return {
    title: category.name,
    description: `${category.description} Browse the ${category.name.toLowerCase()} collection on ToolNest.`,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  const categoryTools = getToolsByCategory(category.slug);
  const availableTools = categoryTools.filter((tool) => tool.available);
  const hasAvailableTools = availableTools.length > 0;
  const availableDescription = category.slug === "image-tools"
    ? "Image Resizer, Image Compressor, and Image Converter handle JPG, PNG, and WebP entirely on your device."
    : category.slug === "pdf-tools"
      ? "PDF Merge combines documents and PDF Split extracts or separates pages entirely on your device."
      : "";

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
              <h2>{hasAvailableTools ? `Work with ${category.shortName.toLowerCase()} privately` : "Tools are coming soon"}</h2>
              <p>{hasAvailableTools ? availableDescription : "This category is still in preview. No files or data are processed here."}</p>
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
