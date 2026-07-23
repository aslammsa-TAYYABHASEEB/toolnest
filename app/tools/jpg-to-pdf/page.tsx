import type { Metadata } from "next";
import { JpgToPdf } from "@/components/jpg-to-pdf";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "JPG to PDF";
const description = "Convert JPG, PNG, and WebP images into one ordered PDF directly in your browser, without uploading them.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/jpg-to-pdf" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/jpg-to-pdf",
    type: "website",
  },
};

const faqs = [
  {
    question: "Can I combine several images into one PDF?",
    answer: "Yes. Add up to 100 JPG, PNG, or WebP images, arrange them in the required order, and ToolNest creates one PDF page for each image.",
  },
  {
    question: "Are my images uploaded?",
    answer: "No. Image validation, decoding, page layout, and PDF creation all happen locally in your browser. Your images never leave your device.",
  },
  {
    question: "What is the difference between Fit and Fill?",
    answer: "Fit shows the complete image and may leave empty space. Fill covers the available page area but may crop image edges. Original avoids enlargement and only scales down when necessary.",
  },
  {
    question: "How is transparency handled?",
    answer: "Transparent PNG and WebP areas are shown against your selected white, light gray, or black PDF page background. White is the default.",
  },
  {
    question: "What does Auto page size do?",
    answer: "Auto creates each page from that image’s natural dimensions and aspect ratio. Optional margins and orientation are still applied.",
  },
  {
    question: "Why are there image and pixel limits?",
    answer: "Browser image decoding can use several times more memory than the compressed source files. Practical limits reduce crashes on phones and low-memory computers.",
  },
];

export default function JpgToPdfPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/jpg-to-pdf`,
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
        description="Arrange JPG, PNG, and WebP images and turn them into one private, browser-created PDF."
        eyebrow="PDF tool"
        accent="coral"
        icon="PDF"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <JpgToPdf />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Images become pages locally</h2>
            <p>
              Your browser validates each image, arranges the pages, and creates
              the final PDF without sending files to ToolNest.
            </p>
            <ul>
              <li>JPG, JPEG, PNG, and WebP</li>
              <li>One image per PDF page</li>
              <li>Up to 100 images and 100 MB total</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">How JPG to PDF works</span>
              <h2>One ordered document from your images</h2>
              <p>
                Add one or more supported images, arrange them in page order,
                choose the page layout, and create a PDF with one image on each
                page. Mixed JPG, PNG, and WebP sets are supported.
              </p>
            </article>
            <article>
              <span className="kicker">Page size and orientation</span>
              <h2>Natural pages or standard paper</h2>
              <p>
                Auto follows each image’s natural aspect ratio. A4, Letter, and
                Legal use standard paper dimensions with automatic, portrait,
                or landscape orientation.
              </p>
            </article>
            <article>
              <span className="kicker">Fit versus Fill</span>
              <h2>Show everything or cover the page</h2>
              <p>
                Fit preserves the complete image and is the default. Fill
                covers the available page but may crop edges. Original keeps
                natural display size where the page allows it.
              </p>
            </article>
            <article>
              <span className="kicker">Image order and privacy</span>
              <h2>Your order, on your device</h2>
              <p>
                Drag images or use the accessible arrow controls to set the
                final page order. All decoding, transparency handling, and PDF
                generation stay inside the browser.
              </p>
            </article>
            <article>
              <span className="kicker">Supported formats</span>
              <h2>JPG, JPEG, PNG, and WebP</h2>
              <p>
                JPG files are embedded directly. PNG transparency is placed
                over the selected page background. WebP is converted locally
                to a PDF-compatible PNG representation when needed.
              </p>
            </article>
            <article>
              <span className="kicker">Browser limitations</span>
              <h2>Memory depends on your device</h2>
              <p>
                Large pixel dimensions can require substantial decoded memory,
                even when files are small. Older browsers and low-memory devices
                may need fewer or smaller images per conversion.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>JPG to PDF FAQs</h2>
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
