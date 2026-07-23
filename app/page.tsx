import { CategoryCard } from "@/components/category-card";
import { ToolCard } from "@/components/tool-card";
import { Badge } from "@/components/ui/badge";
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
          <Badge tone="brand" className="hero-badge"><span className="live-dot" /> Fast, free &amp; easy to use</Badge>
          <h1>Everyday tools,<br /><em>without the clutter.</em></h1>
          <p>A focused collection of useful tools for files, images, text, and calculations. Quick to find, simple to use.</p>
          <div className="hero-search"><SearchInput disabled label="Search the planned ToolNest collection" /></div>
          <div className="hero-actions">
            <Button href="#popular-tools" size="lg">Explore popular tools <span aria-hidden="true">→</span></Button>
            <Button href="#categories" size="lg" variant="secondary">Browse categories</Button>
          </div>
          <div className="trust-row" aria-label="Product benefits">
            <span><i>✓</i> No sign-up</span>
            <span><i>✓</i> Mobile friendly</span>
            <span><i>✓</i> Privacy first</span>
          </div>
        </div>
      </section>

      <section className="section" id="categories">
        <div className="container">
          <div className="section-heading">
            <div><span className="kicker">Browse by category</span><h2>What do you need to do?</h2></div>
            <p>Start with a category and find the right tool for the task.</p>
          </div>
          <div className="category-grid">
            {categories.map((category) => (
              <CategoryCard key={category.slug} category={category} count={getToolsByCategory(category.slug).length} />
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tint" id="popular-tools">
        <div className="container">
          <div className="section-heading">
            <div><span className="kicker">Popular tools</span><h2>Useful shortcuts for everyday work</h2></div>
            <p>Start with the tools available today and see what is coming next.</p>
          </div>
          <div className="tool-grid">
            {popularTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}
          </div>
          <div className="center-action"><Button href="#categories" variant="secondary">View all categories <span aria-hidden="true">→</span></Button></div>
        </div>
      </section>

      <section className="section promise-section">
        <div className="container promise-grid">
          <div><span className="kicker">Built around you</span><h2>Less friction.<br />More getting things done.</h2></div>
          <div className="promise-list">
            <Card as="article"><span>01</span><div><h3>Simple by design</h3><p>Clear screens and focused actions without unnecessary settings.</p></div></Card>
            <Card as="article"><span>02</span><div><h3>Works everywhere</h3><p>A mobile-first experience that adapts to phones, tablets, and desktops.</p></div></Card>
            <Card as="article"><span>03</span><div><h3>Growing thoughtfully</h3><p>A lightweight foundation ready for more practical tools over time.</p></div></Card>
          </div>
        </div>
      </section>

      <aside className="ad-shell" aria-label="Reserved advertising area">
        <div className="container"><span>Advertisement</span><p>Reserved space for a future, clearly labeled ad placement.</p></div>
      </aside>
    </>
  );
}
