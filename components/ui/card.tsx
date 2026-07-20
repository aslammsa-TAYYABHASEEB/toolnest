import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  as?: "article" | "section" | "div";
  interactive?: boolean;
};

export function Card({ children, as: Element = "div", interactive, className, ...props }: CardProps) {
  return <Element className={cn("ui-card", interactive && "ui-card-interactive", className)} {...props}>{children}</Element>;
}
