import Link from "next/link";
import type { Tool } from "@/lib/site";
import { Badge } from "@/components/ui/badge";

type ToolCardProps = {
  tool: Tool;
  variant?: "standard" | "featured" | "compact";
  evidence?: string;
};

export function ToolCard({ tool, variant = "standard", evidence }: ToolCardProps) {
  const href = tool.href ?? `/categories/${tool.category}`;

  return (
    <Link
      className={`ui-card ui-card-interactive tool-card tool-card-${variant}`}
      href={href}
      aria-label={tool.available ? `Open ${tool.name}` : `View ${tool.name} category`}
    >
      <div className="tool-card-top">
        <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
        {!tool.available && <Badge>Coming soon</Badge>}
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.description}</p>
      {evidence && <span className="tool-card-evidence">{evidence}</span>}
    </Link>
  );
}
