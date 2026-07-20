import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export type LegalSection = { heading: string; body: string };

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <>
      <PageHeader title={title} description={intro} eyebrow="ToolNest information" compact />
      <section className="legal-wrap"><Card as="article" className="legal-content"><Badge tone="warning">MVP placeholder</Badge>{sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}</Card></section>
    </>
  );
}
