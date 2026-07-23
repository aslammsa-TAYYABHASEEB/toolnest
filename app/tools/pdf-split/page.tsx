import type { Metadata } from "next";
import { PdfSplit } from "@/components/pdf-split";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF Split";
const description = "Extract selected pages or split a PDF into page and range files directly in your browser, without uploading it.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-split" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-split",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is my PDF uploaded anywhere?",
    answer: "No. ToolNest reads, splits, and packages your PDF locally in your browser. The file never leaves your device.",
  },
  {
    question: "How do I choose specific pages?",
    answer: "Enter individual page numbers, comma-separated pages, or ranges such as 1,3-5,8. Reverse ranges such as 5-3 are normalized, duplicates are removed, and pages stay in document order.",
  },
  {
    question: "Can I create a separate PDF for every page?",
    answer: "Yes. Split every page creates one one-page PDF per source page, with individual downloads and a ZIP containing all results.",
  },
  {
    question: "Why are there page and output limits?",
    answer: "PDF processing uses your device memory. The limits reduce browser crashes on unusually large documents while still covering common reports, handouts, scans, and forms.",
  },
  {
    question: "Can password-protected PDFs be split?",
    answer: "No. Unlock encrypted or password-protected PDFs in an appropriate application before using this browser tool.",
  },
  {
    question: "Will links, forms, and advanced PDF features be preserved?",
    answer: "Visible page content is copied into new PDFs. Some advanced interactive features, document-level attachments, signatures, or unusual structures may not carry over exactly.",
  },
];

export default function PdfSplitPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-split`,
        description,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <PageHeader
        title={title}
        description="Extract selected pages or create separate PDFs by page or range—privately on your device."
        eyebrow="PDF tool"
        accent="coral"
        icon="PDF"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfSplit />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Split without uploading</h2>
            <p>
              Your browser opens the source document, copies the pages you
              choose, and prepares every download locally.
            </p>
            <ul>
              <li>Selected pages, every page, or ranges</li>
              <li>Up to 100 MB per source PDF</li>
              <li>Individual and ZIP downloads</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF Split is</span>
              <h2>Turn one PDF into the documents you need</h2>
              <p>
                PDF Split copies selected pages into one new document, creates
                a separate file for every page, or divides a source document
                into the ranges you define.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Select, choose a mode, and split</h2>
              <ol>
                <li>Select or drop one valid PDF.</li>
                <li>Choose selected pages, every page, or page ranges.</li>
                <li>Review the output plan, split, and download the results.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>Your document stays on your device</h2>
              <p>
                PDF parsing, page copying, filename creation, and ZIP packaging
                all happen inside your browser. There is no upload, server
                queue, account, database, or retained copy.
              </p>
            </article>
            <article>
              <span className="kicker">Supported browsers</span>
              <h2>Built for current browsers</h2>
              <p>
                Current Chrome, Edge, Firefox, and Safari releases support the
                features this tool needs. Available memory varies by browser
                and device, so large or complex PDFs can take longer or fail.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF Split FAQs</h2>
            <div>
              {faqs.map(({ question, answer }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
