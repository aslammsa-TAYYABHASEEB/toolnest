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

  return (
    <>
      <PageHeader title={category.name} description={category.description} eyebrow="Tool category" accent={category.accent} icon={category.icon} />
      <section className="section">
        <div className="container">
          <div className="section-heading compact"><div><h2>{category.shortName} tools</h2></div><p>{categoryTools.length} useful tools in the ToolNest collection.</p></div>
          <div className="tool-grid">{categoryTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
          <div className="category-preview-grid">
            {category.slug !== "image-tools" && <UploadDropzone />}
            <aside className="coming-soon-panel">
              <Badge tone={category.slug === "image-tools" ? "success" : "brand"}>{category.slug === "image-tools" ? "Two tools available" : "More tools planned"}</Badge>
              <h2>{category.slug === "image-tools" ? "Work with images privately" : "Tools are coming soon"}</h2>
              <p>{category.slug === "image-tools" ? "Image Converter and Image Compressor handle JPG, PNG, and WebP entirely on your device." : "This category is still in preview. No files or data are processed here."}</p>
              {category.slug === "image-tools" ? (
                <div className="category-tool-actions">
                  <Button href="/tools/image-compressor" size="sm">Open Image Compressor</Button>
                  <Button href="/tools/image-converter" variant="secondary" size="sm">Open Image Converter</Button>
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
