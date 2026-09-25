import { CategoryCard } from "@/components/category-card";
import { ToolCard } from "@/components/tool-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { categories, getToolsByCategory, tools } from "@/lib/site";

export default function HomePage() {
  const popularTools = tools.filter((tool) => tool.popular);

  return (
    <>
      <section className="hero">
        <div className="hero-orb hero-orb-one" />
        <div className="hero-orb hero-orb-two" />
        <div className="container hero-content">
          <span className="hero-kicker"><span className="live-dot" /> Private tools for practical work</span>
          <h1>Get the task done.<br /><em>Keep control of your data.</em></h1>
          <p>Focused PDF, image, text, and calculator tools with clear actions, local processing where supported, and verification only where it can be proven.</p>
          <div className="hero-search"><SearchInput label="Search ToolNest tools" /></div>
          <div className="hero-actions">
            <Button href="#popular-tools" size="lg">Find a popular tool <span aria-hidden="true">→</span></Button>
            <Button href="#categories" size="lg" variant="secondary">Browse all categories</Button>
          </div>
          <div className="trust-row" aria-label="Product benefits">
            <span><i>✓</i> No sign-up</span>
            <span><i>✓</i> On-device processing</span>
            <span><i>✓</i> Verification where supported</span>
          </div>
        </div>
      </section>

      <section className="section" id="popular-tools">
        <div className="container">
          <div className="section-heading">
            <div><span className="kicker">Popular tools</span><h2>Start with a common task</h2></div>
            <p>Open a focused workspace and get straight to the action.</p>
          </div>
          <div className="tool-grid">{popularTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
        </div>
      </section>

      <section className="section section-tint" id="categories">
        <div className="container">
          <div className="section-heading">
            <div><span className="kicker">Browse by category</span><h2>What do you need to work with?</h2></div>
            <p>Explore every available tool by file or task type.</p>
          </div>
          <div className="category-grid">
            {categories.map((category) => (
              <CategoryCard key={category.slug} category={category} count={getToolsByCategory(category.slug).length} />
            ))}
          </div>
        </div>
      </section>

      <section className="section promise-section" aria-labelledby="how-toolnest-works">
        <div className="container promise-grid">
          <div><span className="kicker">How ToolNest works</span><h2 id="how-toolnest-works">Private by default.<br />Precise about results.</h2><p className="promise-intro">ToolNest keeps workflows focused and makes only the claims each tool can support.</p></div>
          <div className="promise-list">
            <Card as="article"><span>01</span><div><h3>Private where it matters</h3><p>Supported file and text processing happens in your browser without uploading the source to ToolNest.</p></div></Card>
            <Card as="article"><span>02</span><div><h3>Automatic, not mysterious</h3><p>Each workspace guides the task, shows progress, and keeps important limits visible.</p></div></Card>
            <Card as="article"><span>03</span><div><h3>Verified when provable</h3><p>Tools with deterministic checks report what was verified. Other tools make no blanket verification claim.</p></div></Card>
          </div>
        </div>
      </section>

    </>
  );
}
