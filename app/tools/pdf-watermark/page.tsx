import type { Metadata } from "next";
import { PdfWatermark } from "@/components/pdf-watermark";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF Watermark – Add Text Watermark to PDF Online";
const description = "Add a text watermark to PDF pages directly in your browser. Choose position, opacity, rotation, and pages to watermark. Free and private with no file upload.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-watermark" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-watermark",
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
    question: "Are my PDFs uploaded?",
    answer: "No. ToolNest reads, watermarks, and saves the PDF in your browser. The file is not uploaded to ToolNest, and no conversion server is used.",
  },
  {
    question: "Can I watermark selected pages?",
    answer: "Yes. Choose all pages or enter individual pages and ranges such as 1-3,6,8-10.",
  },
  {
    question: "Can I control watermark opacity?",
    answer: "Yes. Adjust opacity from a subtle 5% to fully opaque, along with font size, angle, and page position.",
  },
  {
    question: "Does adding a watermark flatten the PDF?",
    answer: "No. ToolNest adds text to the existing PDF pages with pdf-lib instead of turning each page into an image. Existing selectable text and vector content remain in their original form where the PDF format permits.",
  },
  {
    question: "Can this tool remove an existing watermark?",
    answer: "No. This version only adds new text watermarks; it does not remove or edit watermarks already in a PDF.",
  },
  {
    question: "Can I watermark a password-protected PDF?",
    answer: "No. Unlock encrypted or password-protected PDFs in an appropriate application before using this browser tool.",
  },
];

export default function PdfWatermarkPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "PDF Watermark",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-watermark`,
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
        title="PDF Watermark"
        description="Add a text watermark to all or selected PDF pages, privately in your browser."
        eyebrow="PDF tool"
        accent="coral"
        icon="WM"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfWatermark />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Your document stays on your device</h2>
            <p>
              The browser opens your PDF, adds the text, and prepares the
              download. No document is sent to ToolNest or another service.
            </p>
            <ul>
              <li>Text watermarks</li>
              <li>All or selected pages</li>
              <li>Position, angle, size, and opacity</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">How to use it</span>
              <h2>Add a watermark in three steps</h2>
              <ol>
                <li>Select or drop one PDF.</li>
                <li>Enter text and choose its placement and pages.</li>
                <li>Apply the watermark and download the new PDF.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Flexible placement</span>
              <h2>Keep the mark visible and readable</h2>
              <p>
                Place text in the center or any corner, choose a practical
                angle, and adjust opacity. Long text is fitted inside each
                page’s actual dimensions.
              </p>
            </article>
            <article>
              <span className="kicker">Page selection</span>
              <h2>Watermark only the pages you need</h2>
              <p>
                Apply one consistent watermark to the complete document or use
                page expressions such as 1,3,5 and 1-3,6,8-10.
              </p>
            </article>
            <article>
              <span className="kicker">Document quality</span>
              <h2>No page rasterization</h2>
              <p>
                The watermark is added as PDF text. Original page dimensions,
                selectable text, and vector artwork are not intentionally
                flattened into images.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>No file upload or processing server</h2>
              <p>
                PDF validation, editing, and download preparation happen in
                your browser. ToolNest does not receive or retain the file.
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
            <h2>PDF Watermark FAQs</h2>
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
