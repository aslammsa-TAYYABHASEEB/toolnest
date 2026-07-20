import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
export const metadata: Metadata = { title: "Contact", description: "Get in touch with the ToolNest team." };
export default function Page() { return <>
  <PageHeader title="Contact" description="Have feedback, a tool idea, or a general question? We'd like to hear it." eyebrow="Get in touch" compact />
  <section className="legal-wrap"><Card as="article" className="legal-content contact-card"><Badge tone="warning">MVP placeholder</Badge><h2>Contact channel coming soon</h2><p>A public support email or contact form will be added before launch. This preview is intentionally non-functional.</p><div className="contact-form-preview" aria-label="Contact form preview"><Input label="Email address" type="email" placeholder="you@example.com" disabled /><Input label="Message" placeholder="Tell us what you need..." disabled /></div><div className="contact-note"><span aria-hidden="true">@</span><p><strong>Email address</strong><br />To be confirmed before public launch</p></div></Card></section>
  </>; }
