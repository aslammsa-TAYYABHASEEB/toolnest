import type { Metadata } from "next";
import Link from "next/link";
import { PdfPageNumbers } from "@/components/pdf-page-numbers";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF Page Numbers – Add Page Numbers to PDF Online";
const description = "Add page numbers to PDF files directly in your browser. Choose position, starting number, page range, and numbering style. Free, private, and no file upload required.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-page-numbers" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-page-numbers",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${title} | ${siteConfig.name}`,
    description,
  },
};

const faqs = [
  {
    question: "Can I add page numbers to selected pages?",
    answer: "Yes. Enter individual pages or ranges such as 2,4,6 or 1-3,6,8-10. Selected pages are numbered sequentially in document order.",
  },
  {
    question: "Can I start numbering from a number other than 1?",
    answer: "Yes. Set any valid positive starting number. If you start at 5, the first page you choose receives 5 and the sequence continues from there.",
  },
  {
    question: "Can I use Page 1 of 10 formatting?",
    answer: "Yes. Available formats include 1, Page 1, 1 of 10, and Page 1 of 10. For a selected subset, the total is the number of selected pages.",
  },
  {
    question: "Are my PDFs uploaded?",
    answer: "No. ToolNest reads, numbers, and saves the PDF in your browser. The file is not uploaded, and no external processing service is used.",
  },
  {
    question: "Does adding page numbers flatten the PDF?",
    answer: "No. Page numbers are drawn onto the existing PDF pages without converting those pages to images. Original selectable text and vector content remain intact where the PDF format permits.",
  },
  {
    question: "Can I number only some pages?",
    answer: "Yes. Choose Selected pages and enter the exact pages you want. Pages that are not selected are left unchanged.",
  },
  {
    question: "Can ToolNest remove existing page numbers?",
    answer: "No. This tool adds new page numbers; it does not detect or remove numbers already present in a PDF.",
  },
];

export default function PdfPageNumbersPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "PDF Page Numbers",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-page-numbers`,
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
        title="PDF Page Numbers"
        description="Add clear, customizable page numbers to all or selected PDF pages, privately in your browser."
        eyebrow="PDF tool"
        accent="coral"
        icon="#"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfPageNumbers />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Your document stays on your device</h2>
            <p>
              The browser opens your PDF, adds the numbers, and prepares the
              download. The document is not sent to ToolNest or another service.
            </p>
            <ul>
              <li>Six page positions</li>
              <li>All or selected pages</li>
              <li>Starting number and total formats</li>
              <li>Adjustable size and margins</li>
            </ul>
            <div className="pdf-page-number-related">
              <p>Need to add a logo or text mark?</p>
              <Link href="/tools/pdf-watermark">Try PDF Watermark →</Link>
              <Link href="/tools/pdf-split">Extract pages with PDF Split →</Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">How to use it</span>
              <h2>Number a PDF in three steps</h2>
              <ol>
                <li>Select or drop one PDF.</li>
                <li>Choose the format, position, starting number, and pages.</li>
                <li>Add page numbers and download the new PDF.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Selected pages</span>
              <h2>Keep numbering sequences intuitive</h2>
              <p>
                If you select pages 2, 4, and 6, they receive consecutive
                numbers. Unselected pages remain unchanged.
              </p>
            </article>
            <article>
              <span className="kicker">Flexible formats</span>
              <h2>Use simple numbers or totals</h2>
              <p>
                Choose 1, Page 1, 1 of 10, or Page 1 of 10. Optional prefix
                and suffix text supports specialized document labels.
              </p>
            </article>
            <article>
              <span className="kicker">Document quality</span>
              <h2>No page rasterization</h2>
              <p>
                Numbers are added as PDF text. Original page dimensions,
                selectable text, and vector artwork are not intentionally flattened.
              </p>
            </article>
            <article>
              <span className="kicker">Mixed documents</span>
              <h2>Placement follows each page</h2>
              <p>
                ToolNest calculates alignment from each page’s actual size and
                rotation, including documents with mixed portrait and landscape pages.
              </p>
            </article>
            <article>
              <span className="kicker">Browser limits</span>
              <h2>Large files depend on device memory</h2>
              <p>
                PDFs up to 100 MB and 1,000 pages are accepted. Complex files
                may still require a desktop browser with more available memory.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF Page Numbers FAQs</h2>
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
