import Link from "next/link";
import type { Tool } from "@/lib/site";
import { Badge } from "@/components/ui/badge";

export function ToolCard({ tool }: { tool: Tool }) {
  const href = tool.href ?? `/categories/${tool.category}`;

  return (
    <Link
      className="ui-card ui-card-interactive tool-card"
      href={href}
      aria-label={tool.available ? `Open ${tool.name}` : `View ${tool.name} category`}
    >
      <div className="tool-card-top">
        <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
        {!tool.available && <Badge>Coming soon</Badge>}
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.description}</p>
      <span className="tool-card-cta">
        {tool.available ? "Open tool" : "View category"} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
