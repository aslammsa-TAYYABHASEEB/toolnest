import type { Metadata } from "next";
import { PdfToJpg } from "@/components/pdf-to-jpg";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF to JPG";
const description = "Convert PDF pages into JPG or PNG images directly in your browser, with page selection, quality, scale, and private downloads.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-to-jpg" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-to-jpg",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is my PDF uploaded anywhere?",
    answer: "No. ToolNest opens the PDF, renders the pages, and creates the image downloads locally in your browser. The document never leaves your device.",
  },
  {
    question: "Can I convert only certain PDF pages?",
    answer: "Yes. Convert every page, enter selected pages such as 1,3,5, use ranges such as 2-8, or mix both as 1,3-5,9. Reverse ranges are normalized and duplicates are removed.",
  },
  {
    question: "Should I choose JPG or PNG?",
    answer: "JPG is usually smaller and works well for scanned pages, photographs, and sharing. PNG is lossless and can keep text and line art crisp, but often creates larger files.",
  },
  {
    question: "What does render scale change?",
    answer: "Scale controls output pixel dimensions. A higher scale can make text and details sharper, but it needs more memory and produces larger images. The practical default is 1.5×.",
  },
  {
    question: "Why are some large conversions blocked?",
    answer: "A PDF page expands into millions of pixels while rendering. Page-count, dimension, pixel, and memory estimates protect phones and computers from browser crashes.",
  },
  {
    question: "Can password-protected PDFs be converted?",
    answer: "No. Unlock encrypted or password-protected documents in an appropriate application before using the browser converter.",
  },
];

export default function PdfToJpgPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-to-jpg`,
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
        description="Turn all or selected PDF pages into downloadable JPG or PNG images, privately in your browser."
        eyebrow="PDF tool"
        accent="coral"
        icon="JPG"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfToJpg />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Pages become images locally</h2>
            <p>
              Your browser reads and renders the document without sending it
              to ToolNest or any conversion server.
            </p>
            <ul>
              <li>JPG and lossless PNG output</li>
              <li>All, selected, or ranged pages</li>
              <li>Individual and ZIP downloads</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF to JPG is</span>
              <h2>Make a shareable image from each page</h2>
              <p>
                PDF to JPG renders document pages as standard images for
                previews, presentations, websites, messages, or workflows that
                do not accept PDF files. PNG output is also available.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Select, tune, and convert</h2>
              <ol>
                <li>Select or drop one valid PDF.</li>
                <li>Choose pages, output format, quality, and render scale.</li>
                <li>Convert, preview the results, and download images or a ZIP.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Page selection</span>
              <h2>Convert exactly the pages you need</h2>
              <p>
                Use the full document, a single range, or expressions such as
                1,3,5, 2-8, and 1,3-5,9. Page numbers are checked before any
                rendering begins.
              </p>
            </article>
            <article>
              <span className="kicker">JPG quality and scale</span>
              <h2>Balance detail, size, and memory</h2>
              <p>
                JPG quality controls compression. Render scale controls pixel
                dimensions and sharpness. PNG is lossless, so its quality
                control is intentionally hidden.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>No upload or server copy</h2>
              <p>
                PDF parsing, canvas rendering, image encoding, thumbnails,
                filenames, and ZIP packaging all happen on your device. Clearing
                the tool releases its temporary browser URLs.
              </p>
            </article>
            <article>
              <span className="kicker">Supported browsers</span>
              <h2>Designed for current browser releases</h2>
              <p>
                Current Chrome, Edge, Firefox, and Safari support the required
                PDF worker, canvas, Blob, and download features. Very complex
                PDFs and low-memory devices may require fewer pages or a lower
                scale.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF to JPG FAQs</h2>
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
