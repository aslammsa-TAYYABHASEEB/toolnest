import Link from "next/link";
import type { Tool } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function ToolCard({ tool }: { tool: Tool }) {
  const href = tool.href ?? `/categories/${tool.category}`;

  return (
    <Card as="article" className="tool-card" interactive>
      <div className="tool-card-top">
        <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
        {tool.available ? <Badge tone="success">Available</Badge> : <Badge>Coming soon</Badge>}
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.description}</p>
      <Link href={href} aria-label={tool.available ? `Open ${tool.name}` : `View ${tool.name} category`}>
        {tool.available ? "Open tool" : "Coming soon"} <span aria-hidden="true">→</span>
      </Link>
    </Card>
  );
}
