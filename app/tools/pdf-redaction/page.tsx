import type { Metadata } from "next";
import { PdfRedaction } from "@/components/pdf-redaction";
import { RelatedTools } from "@/components/related-tools";
import { PageHeader } from "@/components/ui/page-header";
import { ToolPageShell } from "@/components/ui/tool-page-shell";
import { siteConfig } from "@/lib/site";

const title = "PDF Redaction";
const description = "Permanently cover selected PDF areas in a fresh image-only copy, then verify the generated output before download.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/tools/pdf-redaction" },
  openGraph: { title: title + " | " + siteConfig.name, description, url: "/tools/pdf-redaction", type: "website" },
  twitter: { card: "summary", title: title + " | " + siteConfig.name, description },
};
const faqs = [
  { question: "Is my PDF uploaded?", answer: "No. Your PDF, marked areas, generated copy and verification stay in your browser. Desktop Chrome or Edge is required for this version." },
  { question: "What does redaction remove?", answer: "ToolNest replaces pixels within the rectangles you mark, rebuilds every page as a fresh image, and checks the actual generated PDF. Unmarked visible information remains; ToolNest does not find sensitive information automatically." },
  { question: "What will the copy lose?", answer: "The image-only copy loses selectable and searchable text, interactive links, native vector scalability, metadata, attachments, comments and other interactive structures. Forms and layer PDFs are refused rather than converted." },
  { question: "What do the supported checks prove?", answer: "They check the restricted fresh image-only format, page geometry, complete masked pixels, preservation of unmarked raster pixels, and absence of inherited text and interactive structures. They are not a universal forensic guarantee or a claim that all sensitive information was found." },
  { question: "Can I use a signed or password-protected PDF?", answer: "No. PDFs with digital signature structures, unknown signature safety, encryption, forms or optional layers are refused. ToolNest does not validate signatures cryptographically." },
];
export default function PdfRedactionPage() {
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", name: title, description, applicationCategory: "UtilitiesApplication", operatingSystem: "Desktop Chrome or Edge", url: siteConfig.url + "/tools/pdf-redaction", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@type": "FAQPage", mainEntity: faqs.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) },
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <PageHeader title={title} description={description} eyebrow="Mark, review, redact" accent="blue" icon="PDF" />
    <ToolPageShell width="wide"><PdfRedaction /></ToolPageShell>
    <section className="section section-tint tool-content"><div className="container"><div className="faq-section"><span className="kicker">Helpful answers</span><h2>PDF Redaction FAQs</h2><div>{faqs.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></div></div></section>
    <RelatedTools currentHref="/tools/pdf-redaction" />
  </>;
}
