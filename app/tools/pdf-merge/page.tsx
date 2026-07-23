import type { Metadata } from "next";
import { PdfMerge } from "@/components/pdf-merge";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF Merge";
const description = "Combine multiple PDF files in your chosen order directly in your browser, without uploading them to a server.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-merge" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-merge",
    type: "website",
  },
};

const faqs = [
  {
    question: "Are my PDF files uploaded?",
    answer: "No. ToolNest reads and merges your PDFs locally in your browser. The files never leave your device.",
  },
  {
    question: "How many PDFs can I merge?",
    answer: "There is no fixed file-count limit, but the combined files must be 100 MB or less. Your device memory and browser also affect how many large PDFs can be handled comfortably.",
  },
  {
    question: "Can I change the PDF order?",
    answer: "Yes. Drag files into the order you want, or use the accessible up and down buttons. Pages are copied in that exact order.",
  },
  {
    question: "Can password-protected PDFs be merged?",
    answer: "No. Encrypted or password-protected PDFs must be unlocked in an appropriate application before this browser tool can merge them.",
  },
  {
    question: "Will merging change the pages?",
    answer: "ToolNest copies pages into a new PDF without intentionally changing their visible content. Some advanced interactive features or unusual PDF structures may not carry over exactly.",
  },
];

export default function PdfMergePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-merge`,
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
        description="Combine PDF files in the order you choose, without uploading them."
        eyebrow="PDF tool"
        accent="coral"
        icon="PDF"
      />
      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfMerge />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Merge on your device</h2>
            <p>
              Your browser opens, arranges, and combines every page locally.
              Nothing is sent to ToolNest or placed in a server queue.
            </p>
            <ul>
              <li>Multiple PDFs</li>
              <li>Up to 100 MB total</li>
              <li>Drag or keyboard reordering</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF Merge is</span>
              <h2>One document from several PDFs</h2>
              <p>
                PDF Merge copies the pages from two or more PDF files into one
                new document. Arrange contracts, scans, reports, or handouts in
                the sequence you need, then download a single combined file.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Select, arrange, and merge</h2>
              <ol>
                <li>Select or drop at least two valid PDF files.</li>
                <li>Drag files into order or use the up and down buttons.</li>
                <li>Choose Merge PDFs, review the result, and download it.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>Your files stay on your device</h2>
              <p>
                PDF parsing and page copying happen entirely inside your browser.
                There is no upload, account, database, or server-side file
                retention involved in the merge.
              </p>
            </article>
            <article>
              <span className="kicker">Supported browsers</span>
              <h2>Designed for modern browsers</h2>
              <p>
                Current versions of Chrome, Edge, Firefox, and Safari support
                the browser features this tool needs. Older browsers and
                low-memory devices may struggle with large or complex PDFs.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF Merge FAQs</h2>
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
