import Link from "next/link";
import { getRelatedTools } from "@/lib/site";

export function RelatedTools({ currentHref }: { currentHref: string }) {
  const relatedTools = getRelatedTools(currentHref);
  if (relatedTools.length === 0) return null;

  return (
    <section className="related-tools-section" aria-labelledby="related-tools-heading">
      <div className="container">
        <div className="related-tools-heading">
          <div>
            <span className="kicker">Continue your workflow</span>
            <h2 id="related-tools-heading">Related tools</h2>
          </div>
          <p>Useful next steps, with the same simple ToolNest experience.</p>
        </div>
        <div className="related-tools-list">
          {relatedTools.map((tool) => (
            <Link key={tool.href} href={tool.href!}>
              <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
              <span>
                <strong>{tool.name}</strong>
                <small>{tool.description}</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
