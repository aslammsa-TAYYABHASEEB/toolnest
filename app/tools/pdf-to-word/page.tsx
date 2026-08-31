import type { Metadata } from "next";
import { PdfToWord } from "@/components/pdf-to-word";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF to Word";
const description =
  "Convert PDF text to a downloadable Word document (.docx) directly in your browser, with privacy and honesty about text-extraction-only scope.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-to-word" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-to-word",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is my PDF uploaded anywhere?",
    answer:
      "No. PDF parsing, text extraction, Word document encoding, filenames, and downloads all happen locally in your browser. The document never leaves your device.",
  },
  {
    question:
      "Can I convert password-protected PDFs?",
    answer:
      "No. Unlock encrypted or password-protected documents in an appropriate application before using the browser converter.",
  },
  {
    question:
      "What types of PDFs work best?",
    answer:
      "Text-heavy PDFs convert most reliably. PDFs with complex layouts, tables, columns, or many images may lose that formatting in the Word output, as this tool extracts text rather than preserving exact layout. If a page contains images, the Word document will include a note on that page indicating images were present but not embedded.",
  },
  {
    question:
      "Why is the output sometimes larger than the original PDF?",
    answer:
      "The Word document contains the extracted text in a structured format with XML markup. For short documents with large images, the .docx file can be bigger than the source PDF. For long text-only documents, it is typically smaller.",
  },
  {
    question:
      "Can I use this for important or sensitive documents?",
    answer:
      "Yes. All processing happens entirely in your browser — no PDF is uploaded, stored, or sent to any server. However, for highly sensitive documents, use an offline PDF editor for complete control.",
  },
];

export default function PdfToWordPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-to-word`,
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
        description="Convert PDF text to a downloadable Word document (.docx) privately in your browser."
        eyebrow="PDF tool"
        accent="coral"
        icon="DOC"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfToWord />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Text extraction locally</h2>
            <p>
              Your browser reads and extracts the PDF text without sending it
              to ToolNest or any conversion server.
            </p>
            <ul>
              <li>Text extracted into paragraphs</li>
              <li>Up to 300 pages supported</li>
              <li>Up to 50 MB output size</li>
              <li>All downloads happen in-browser</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF to Word is</span>
              <h2>Turn PDF text into a .docx document</h2>
              <p>
                PDF to Word renders document text as a Word (.docx) file for
                editing, sharing, and further formatting. PNG output is also
                available, but this tool is optimized for text extraction.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Select, convert, and download</h2>
              <ol>
                <li>Select or drop one valid PDF.</li>
                <li>Click Convert to Word.</li>
                <li>Download the .docx file when ready.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Supported PDFs</span>
              <h2>Best for text-heavy documents</h2>
              <p>
                This tool works best for PDFs consisting mainly of text. Complex
                layouts, tables, columns, and images may not be preserved
                exactly. For documents where exact layout preservation is critical,
                use a dedicated PDF editor.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>No upload or server copy</h2>
              <p>
                PDF parsing, text extraction, Word document encoding, filenames,
                and downloads all happen on your device. Clearing the tool releases
                its temporary browser URLs.
              </p>
            </article>
            <article>
              <span className="kicker">Supported browsers</span>
              <h2>Designed for current browser releases</h2>
              <p>
                Current Chrome, Edge, Firefox, and Safari support the required
                PDF worker, canvas, Blob, and download features. Very complex
                PDFs and low-memory devices may require fewer pages or result in
                larger output files.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF to Word FAQs</h2>
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