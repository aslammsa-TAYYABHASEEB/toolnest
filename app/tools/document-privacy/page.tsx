import type { Metadata } from "next";
import { DocumentPrivacy } from "@/components/document-privacy";
import { RelatedTools } from "@/components/related-tools";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Document Privacy Inspector & PDF Sanitizer";
const description = "Inspect PDFs for metadata, attachments, active actions, comments, hidden text, forms, redaction risks, and other privacy traces. Remove supported items privately in your browser.";
export const metadata: Metadata = { title, description, alternates: { canonical: "/tools/document-privacy" }, openGraph: { title: `${title} | ${siteConfig.name}`, description, url: "/tools/document-privacy", type: "website" }, twitter: { card: "summary", title: `${title} | ${siteConfig.name}`, description } };
const faqs = [
  { question: "Is my PDF uploaded?", answer: "No. Inspection, supported cleanup, verification, and download preparation happen in your browser. Your PDF is not sent to ToolNest or a paid API." },
  { question: "What can this version remove?", answer: "It can create and verify a new copy without document metadata and XMP, embedded files, dangerous JavaScript or Launch actions, and selected review comments. Each selected category is reinspected after removal." },
  { question: "What does Quick Clean remove?", answer: "Quick Clean selects detected metadata, embedded files, and dangerous active actions. It intentionally leaves comments unselected because removing review annotations can discard useful work." },
  { question: "Does a clean report guarantee the PDF is safe?", answer: "No. This is a bounded structural inspection, not a forensic certificate. Forms, hidden text, possible fake redactions, layers, external links, image metadata, encrypted files, and proprietary structures have stated limits or remain inspection-only." },
  { question: "What happens to digital signatures?", answer: "Creating any sanitized copy rewrites the PDF and invalidates existing digital signatures. ToolNest warns when a signature structure is detected so you can keep the signed original." },
];

export default function DocumentPrivacyPage() {
  const structuredData = { "@context": "https://schema.org", "@graph": [{ "@type": "SoftwareApplication", name: "Document Privacy Inspector & PDF Sanitizer", applicationCategory: "SecurityApplication", operatingSystem: "Any with a modern web browser", url: `${siteConfig.url}/tools/document-privacy`, description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }, { "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <PageHeader title="Document Privacy Inspector" description="Find privacy-relevant traces in a PDF, then create a verified sanitized copy for the categories ToolNest can remove safely." eyebrow="PDF privacy tool" accent="coral" icon="SAFE" />
    <section className="tool-page-section"><div className="container tool-page-grid"><DocumentPrivacy /><aside className="tool-side-note"><span className="kicker">Evidence before action</span><h2>Inspect first, remove selectively</h2><p>ToolNest explains what it found, what can be removed, what verification proved, and what still needs manual review.</p><ul><li>Private browser processing</li><li>Source file remains unchanged</li><li>Verified supported removals</li><li>No misleading privacy score</li></ul></aside></div></section>
    <section className="section section-tint tool-content"><div className="container"><div className="tool-copy-grid"><article><span className="kicker">Inspection</span><h2>See more than visible pages</h2><p>Review metadata, XMP, attachments, executable actions, comments, forms, links, hidden text evidence, possible fake redactions, layers, thumbnails, and image-metadata signals.</p></article><article><span className="kicker">Sanitization</span><h2>Remove only supported categories</h2><p>Create a separate copy without selected metadata, embedded files, JavaScript or Launch actions, and review comments. The original is never overwritten.</p></article><article><span className="kicker">Verification</span><h2>Reinspect the output</h2><p>Each supported removal reports verified removed, removal failed, or could not verify. ToolNest does not turn uncertainty into a success claim.</p></article><article><span className="kicker">Limits</span><h2>Not a forensic certificate</h2><p>Complex redaction, hidden content, encrypted files, proprietary annotations, image payload metadata, and unsupported PDF features can require specialist review.</p></article></div><div className="faq-section"><span className="kicker">Helpful answers</span><h2>Document privacy FAQs</h2><div>{faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></div></section>
    <RelatedTools currentHref="/tools/document-privacy" />
  </>;
}
