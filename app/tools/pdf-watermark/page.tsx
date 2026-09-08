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
    answer: "No. ToolNest reads the PDF, draws the watermark, and creates the download inside your browser. The PDF is not uploaded to ToolNest or a conversion server.",
  },
  {
    question: "Can I watermark only selected pages?",
    answer: "Yes. Apply the watermark to every page or enter page numbers and ranges such as 1-3,6,8-10.",
  },
  {
    question: "Can I control watermark opacity and angle?",
    answer: "Yes. Choose the watermark opacity and select a horizontal, diagonal, or vertical angle before creating the PDF.",
  },
  {
    question: "Does adding a watermark flatten the PDF?",
    answer: "No. ToolNest adds text to the existing PDF pages with PDF drawing commands rather than rasterizing each page. Existing selectable text and vector content are preserved where the PDF library supports them.",
  },
  {
    question: "Can this tool remove an existing watermark?",
    answer: "No. This version only adds new text watermarks. It does not remove or edit watermarks that are already present in a PDF.",
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
        description="Add a custom text watermark to all or selected PDF pages without uploading the document."
        eyebrow="PDF tool"
        accent="coral"
        icon="WM"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfWatermark />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Add watermark text locally</h2>
            <p>
              Your browser opens the PDF, draws the watermark on the pages you
              choose, and creates a new download without a conversion-server upload.
            </p>
            <ul>
              <li>Text watermark only</li>
              <li>All pages or selected ranges</li>
              <li>Position, opacity, angle, and font size controls</li>
              <li>Original pages are not rasterized</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF Watermark does</span>
              <h2>Add visible text to PDF pages</h2>
              <p>
                Enter a label such as CONFIDENTIAL, DRAFT, or a short ownership
                notice, then place it on the pages you choose. The result is a
                new PDF while the original file remains unchanged.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Choose, customize, and download</h2>
              <ol>
                <li>Select or drop one PDF.</li>
                <li>Enter watermark text and choose size, opacity, angle, position, and pages.</li>
                <li>Apply the watermark and download the new PDF.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Page selection</span>
              <h2>Watermark the whole file or selected pages</h2>
              <p>
                Use all pages for a document-wide mark, or enter page selections
                such as 1, 1-3, 1,3,5, or 1-3,6,8-10.
              </p>
            </article>
            <article>
              <span className="kicker">Document quality</span>
              <h2>No page rasterization</h2>
              <p>
                The watermark is drawn onto existing PDF pages. ToolNest does not
                convert each page into an image just to add the text watermark.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>No PDF upload to ToolNest</h2>
              <p>
                File reading, page modification, PDF saving, and download creation
                happen in your browser. No API or remote conversion service processes the PDF.
              </p>
            </article>
            <article>
              <span className="kicker">Current scope</span>
              <h2>Simple text watermarks for v1</h2>
              <p>
                This version adds one text watermark per selected page. Image logos,
                repeated tile patterns, custom fonts, and removing existing watermarks
                are not included.
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
