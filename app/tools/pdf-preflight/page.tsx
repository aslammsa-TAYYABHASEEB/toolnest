import type { Metadata } from "next";
import { PdfPreflight } from "@/components/pdf-preflight";
import { RelatedTools } from "@/components/related-tools";
import { PageHeader } from "@/components/ui/page-header";
import { ToolPageShell } from "@/components/ui/tool-page-shell";
import { TrustStrip } from "@/components/ui/trust-strip";
import { siteConfig } from "@/lib/site";

const title = "PDF Preflight";
const description = "Check PDF requirements and safety findings, approve supported changes, then inspect the actual output in your browser.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/tools/pdf-preflight" },
  openGraph: { title: title + " | " + siteConfig.name, description, url: "/tools/pdf-preflight", type: "website" },
  twitter: { card: "summary", title: title + " | " + siteConfig.name, description },
};
const faqs = [
  { question: "Is my PDF uploaded?", answer: "No. Inspection, approved changes, and output reinspection happen in your browser. The file is not uploaded to ToolNest." },
  { question: "What can this prototype change?", answer: "It can remove approved metadata, embedded files, dangerous active actions, external URI links, and review comments using existing ToolNest sanitizers. It can also try lossless Structure optimization when an unsigned PDF exceeds your size limit." },
  { question: "Does PDF Preflight guarantee portal acceptance?", answer: "No. It checks only the requirements you enter and the bounded safety categories shown. Unsupported or unchecked requirements remain visible." },
  { question: "What happens to signed PDFs?", answer: "ToolNest reports digital signature structure and disables automatic rewriting because rewriting can invalidate an existing signature. It does not validate the signature cryptographically." },
];

export default function PdfPreflightPage() {
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", name: title, applicationCategory: "UtilitiesApplication", operatingSystem: "Any with a modern web browser", url: siteConfig.url + "/tools/pdf-preflight", description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@type": "FAQPage", mainEntity: faqs.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) },
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <PageHeader title="PDF Preflight" description="See what does not meet your requirements, review exactly what ToolNest would change, approve it, then inspect the actual result." eyebrow="Transparent PDF checks" accent="blue" icon="PDF" />
    <ToolPageShell width="wide" trust={<TrustStrip label="Local workflow" title="File not uploaded" description="Inspect first, approve changes, then check the actual output." items={["Processed on this device", "Original file stays unchanged", "Uncertainty remains visible"]} />}><PdfPreflight /></ToolPageShell>
    <section className="section section-tint tool-content"><div className="container"><div className="tool-copy-grid"><article><span className="kicker">Requirements</span><h2>Check only what you specify</h2><p>Set optional size, page-count, and page-size limits. Encryption is always checked, and dangerous actions are checked by default.</p></article><article><span className="kicker">Plan</span><h2>Approve before changes</h2><p>Passed checks, supported fixes, manual decisions, preservation intent, and unchecked areas stay separate.</p></article><article><span className="kicker">After</span><h2>Inspect the actual output</h2><p>Supported removals and any accepted Structure optimization are followed by a fresh inspection of the in-memory output.</p></article><article><span className="kicker">Limits</span><h2>No acceptance guarantee</h2><p>This prototype does not know portal-specific rules and does not automatically resize pages or use destructive compression.</p></article></div><div className="faq-section"><span className="kicker">Helpful answers</span><h2>PDF Preflight FAQs</h2><div>{faqs.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></div></div></section>
    <RelatedTools currentHref="/tools/pdf-preflight" />
  </>;
}
