import type { Metadata } from "next";
import { PdfToWord } from "@/components/pdf-to-word";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF to Word Converter – Convert PDF to Editable DOCX";
const description =
  "Convert PDF files to editable Word documents in your browser. Supports text PDFs, OCR for scanned pages, and basic table reconstruction. Private, free, and no file upload required.";

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
    question: "Are my PDF files uploaded?",
    answer:
      "No. PDF reading, OCR, table detection, Word document creation, and downloads happen in your browser. Your PDF contents are not uploaded to ToolNest or a conversion server.",
  },
  {
    question: "Does PDF to Word work with scanned PDFs?",
    answer:
      "Yes. When a page has little or no selectable text, ToolNest can use on-device OCR to recognize text. OCR quality depends on scan clarity, orientation, and document complexity.",
  },
  {
    question: "Does OCR require internet access?",
    answer:
      "The PDF itself stays on your device, but OCR may need to download language or engine assets the first time they are required. After those assets are available, recognition still runs on your device.",
  },
  {
    question: "Are tables preserved in the Word document?",
    answer:
      "The converter attempts to detect simple, regular tables and rebuild them as real Word tables. Complex, irregular, heavily styled, or poorly scanned tables may fall back to plain text or lose some structure.",
  },
  {
    question: "Will the Word document match the PDF exactly?",
    answer:
      "No. The tool is designed to recover editable text and basic table structure, not create a pixel-perfect replica. Multi-column layouts, graphics, embedded images, unusual spacing, and exact formatting may not be preserved.",
  },
  {
    question: "Can I convert password-protected PDFs?",
    answer:
      "No. Unlock encrypted or password-protected documents in an appropriate application before using the browser converter.",
  },
];

export default function PdfToWordPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "PDF to Word Converter",
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
        title="PDF to Word Converter"
        description="Convert text PDFs and scanned pages to an editable Word (.docx) document privately in your browser."
        eyebrow="PDF tool"
        accent="coral"
        icon="DOC"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfToWord />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Editable DOCX, processed locally</h2>
            <p>
              Text-based PDFs are read directly in your browser. Scanned pages
              can use on-device OCR, and simple regular tables are reconstructed
              when the converter can identify them reliably.
            </p>
            <ul>
              <li>Editable Word (.docx) output</li>
              <li>OCR for scanned or image-only pages</li>
              <li>Basic table reconstruction</li>
              <li>No PDF file upload</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF to Word is</span>
              <h2>Turn PDF content into an editable .docx file</h2>
              <p>
                PDF to Word creates a downloadable Word (.docx) document from
                readable PDF content. Text PDFs are processed directly, while
                scanned or image-only pages can use OCR when needed.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Select, convert, and download</h2>
              <ol>
                <li>Select or drop one valid PDF.</li>
                <li>Choose Convert to Word and let the browser process each page.</li>
                <li>Download the resulting .docx file when it is ready.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Tables and layout</span>
              <h2>Basic structure where it can be detected</h2>
              <p>
                The converter attempts to detect simple, regular tables and
                rebuild them as Word tables. Complex page layouts, irregular
                tables, multi-column designs, graphics, embedded images, and
                exact formatting may not carry over perfectly.
              </p>
            </article>
            <article>
              <span className="kicker">Scanned PDFs</span>
              <h2>OCR when selectable text is missing</h2>
              <p>
                Pages with little or no selectable text can be recognized with
                on-device OCR. The first OCR use may need to download language or
                engine assets, but the PDF contents themselves are not uploaded.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>No upload or server copy</h2>
              <p>
                PDF parsing, OCR, table detection, Word document encoding,
                filenames, and downloads run on your device. Clearing the tool
                releases its temporary browser URLs.
              </p>
            </article>
            <article>
              <span className="kicker">Formatting limits</span>
              <h2>Editable output, not a pixel-perfect replica</h2>
              <p>
                This tool prioritizes editable text and recoverable document
                structure. For documents where exact page design, graphics, or
                image placement must be preserved, use a dedicated PDF editor.
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
