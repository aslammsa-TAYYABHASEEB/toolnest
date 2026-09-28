import Link from "next/link";
import { CategoryCard } from "@/components/category-card";
import { ToolCard } from "@/components/tool-card";
import { SearchInput } from "@/components/ui/search-input";
import { categories, getToolsByCategory, tools } from "@/lib/site";

export default function HomePage() {
  const availableTools = tools.filter((tool) => tool.available);
  const popularTools = tools.filter((tool) => tool.popular);
  const featuredTools = [
    { href: "/tools/pdf-to-excel", evidence: "Source Review · Automatic checks" },
    { href: "/tools/document-privacy", evidence: "Verified supported removals" },
    { href: "/tools/searchable-pdf", evidence: "Local OCR · language data may download" },
    { href: "/tools/image-to-text", evidence: "Local OCR · editable text output" },
  ].map(({ href, evidence }) => ({
    tool: tools.find((tool) => tool.href === href)!,
    evidence,
  }));

  return (
    <>
      <section className="hero">
        <div className="container hero-content">
          <h1>Browser tools for PDFs, images, text, and everyday calculations.</h1>
          <p>Choose a focused workspace and work directly in your browser. No account or setup required.</p>
          <div className="hero-search"><SearchInput label="Search ToolNest tools" /></div>
          <div className="hero-shortcuts">
            <Link href="#popular-tools">Popular tasks</Link>
            <Link href="#categories">Browse categories</Link>
          </div>
          <p className="hero-note">{availableTools.length} available tools · source content stays on this device</p>
        </div>
      </section>

      <section className="section" id="popular-tools">
        <div className="container-app">
          <div className="section-heading">
            <div><h2>Useful work, ready to start</h2></div>
            <p>Featured workflows show the evidence or processing detail that makes them distinct.</p>
          </div>
          <div className="featured-tool-grid">
            {featuredTools.map(({ tool, evidence }) => <ToolCard key={tool.name} tool={tool} variant="featured" evidence={evidence} />)}
          </div>
          <div className="popular-secondary-heading"><h3>More common tasks</h3><p>Quick utilities with the same focused workspace.</p></div>
          <div className="tool-grid tool-grid-compact">{popularTools.map((tool) => <ToolCard key={tool.name} tool={tool} variant="compact" />)}</div>
        </div>
      </section>

      <section className="section section-tint" id="categories">
        <div className="container">
          <div className="section-heading">
            <div><h2>Browse by what you are working with</h2></div>
            <p>Each category leads to a complete, crawlable tool collection.</p>
          </div>
          <div className="category-grid">
            {categories.map((category) => (
              <CategoryCard
                key={category.slug}
                category={category}
                count={getToolsByCategory(category.slug).length}
                examples={getToolsByCategory(category.slug).filter((tool) => tool.available).slice(0, 3).map((tool) => tool.name)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="section evidence-section" aria-labelledby="how-toolnest-works">
        <div className="container">
          <div className="section-heading evidence-heading">
            <div><h2 id="how-toolnest-works">What stays local—and what gets checked</h2></div>
            <p>ToolNest states processing and verification limits where they matter.</p>
          </div>
          <div className="evidence-list">
            <article><span>Local processing</span><div><h3>Source content stays on this device</h3><p>Supported file, text, image, and calculation work runs in your browser instead of an application upload pipeline.</p></div></article>
            <article><span>OCR assets</span><div><h3>Files stay local; language data may download</h3><p>OCR tools may fetch English or orientation language data when needed. Those body-free requests do not include your file.</p></div></article>
            <article><span>Proof where available</span><div><h3>Evidence is named, not implied</h3><p>PDF to Excel includes Source Review and Automatic checks. Document Privacy reinspects supported removals.</p></div></article>
          </div>
        </div>
      </section>

    </>
  );
}
