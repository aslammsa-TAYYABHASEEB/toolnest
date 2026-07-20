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
    description: `${category.description} Browse the planned ${category.name.toLowerCase()} collection on ToolNest.`,
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
          <div className="section-heading compact"><div><h2>Planned {category.shortName} tools</h2></div><p>{categoryTools.length} useful tools in our initial roadmap.</p></div>
          <div className="tool-grid">{categoryTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
          <div className="category-preview-grid">
            <UploadDropzone />
            <aside className="coming-soon-panel">
              <Badge tone="brand">Sprint 2 foundation</Badge>
              <h2>Tools are coming soon</h2>
              <p>This release provides discovery and interface previews only. No files or data are processed.</p>
              <Button href="/#categories" variant="secondary" size="sm">Back to all categories</Button>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
