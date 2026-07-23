import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type ProcessingCardProps = {
  className?: string;
  children: ReactNode;
};

export function ProcessingCard({
  className = "",
  children,
}: ProcessingCardProps) {
  return (
    <Card className={`converter-controls${className ? ` ${className}` : ""}`}>
      {children}
    </Card>
  );
}
