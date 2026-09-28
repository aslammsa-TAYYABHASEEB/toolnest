import Link from "next/link";
import { getRelatedTools } from "@/lib/site";

export function RelatedTools({ currentHref }: { currentHref: string }) {
  const relatedTools = getRelatedTools(currentHref);
  if (relatedTools.length === 0) return null;

  return (
    <section className="related-tools-section" aria-labelledby="related-tools-heading">
      <div className="container-app">
        <div className="related-tools-heading">
          <div>
            <h2 id="related-tools-heading">Related tools</h2>
          </div>
          <p>Continue with a nearby task.</p>
        </div>
        <div className="related-tools-list">
          {relatedTools.map((tool) => (
            <Link key={tool.href} href={tool.href!}>
              <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
              <span>
                <strong>{tool.name}</strong>
                <small>{tool.description}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
