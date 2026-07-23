import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const description = "Contact ToolNest with feedback, support questions, or suggestions for browser-based tools.";

export const metadata: Metadata = {
  title: "Contact",
  description,
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact ToolNest", description, url: "/contact" },
  ...(!siteConfig.contactEmail && { robots: { index: false, follow: true } }),
};

export default function Page() {
  const hasContactEmail = Boolean(siteConfig.contactEmail);

  return (
    <>
      <PageHeader title="Contact" description="Have feedback, a tool idea, or a general question? We'd like to hear it." eyebrow="Get in touch" compact />
      <section className="legal-wrap">
        <Card as="article" className="legal-content contact-card">
          <Badge tone={hasContactEmail ? "success" : "warning"}>
            {hasContactEmail ? "Email support" : "Configuration required"}
          </Badge>
          <h2>{hasContactEmail ? "Contact ToolNest" : "Contact details are not configured"}</h2>
          <p>
            {hasContactEmail
              ? "Email us with a clear description of your question or feedback. Do not attach confidential or sensitive files."
              : "The site owner must set NEXT_PUBLIC_CONTACT_EMAIL before a public deployment."}
          </p>
          {hasContactEmail && (
            <p>
              <a className={buttonClassName()} href={`mailto:${siteConfig.contactEmail}`}>
                Email {siteConfig.contactEmail}
              </a>
            </p>
          )}
          <div className="contact-note">
            <span aria-hidden="true">@</span>
            <p>
              <strong>{hasContactEmail ? siteConfig.contactEmail : "Email unavailable"}</strong>
              <br />
              Tool files are processed locally. Please describe an issue without sending the source file.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}
