import Link from "next/link";
import type { Tool } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Card as="article" className="tool-card" interactive>
      <div className="tool-card-top">
        <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
        {tool.popular ? <Badge tone="success">Popular</Badge> : <Badge>Coming soon</Badge>}
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.description}</p>
      <Link href={`/categories/${tool.category}`} aria-label={`View ${tool.name} category`}>
        Coming soon <span aria-hidden="true">→</span>
      </Link>
    </Card>
  );
}
