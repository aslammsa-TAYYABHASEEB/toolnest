import type { Metadata } from "next";
import { PdfCompress } from "@/components/pdf-compress";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Compress PDF";
const description = "Reduce PDF file size in your browser with structure optimization or image re-encoding, without uploading anything.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-compress" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-compress",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is my PDF uploaded?",
    answer: "No. ToolNest reads the PDF, applies compression, and saves the result locally in your browser. The document never leaves your device.",
  },
  {
    question: "What is the difference between the compression levels?",
    answer: "Structure optimization re-saves the PDF with compressed object streams without re-encoding images, so text and vector graphics stay lossless. Balanced and Strong re-render pages to JPG at lower quality, which produces smaller files but converts vector text and graphics to images.",
  },
  {
    question: "Which level should I choose?",
    answer: "Start with Structure optimization for text-heavy PDFs. Use Balanced for scanned documents or image-heavy PDFs. Use Strong only when you need the smallest file and can accept lower image quality.",
  },
  {
    question: "Does compression reduce PDF quality?",
    answer: "Structure optimization preserves all content exactly. Balanced and Strong re-render pages to JPG, which reduces image quality. Choose the lowest level that achieves your target file size.",
  },
  {
    question: "Can I compress password-protected PDFs?",
    answer: "No. Unlock encrypted or password-protected PDFs in an appropriate application before using this browser tool.",
  },
  {
    question: "Why is image re-encoding limited to 100 pages?",
    answer: "Re-rendering pages to images is memory-intensive. The 100-page limit protects your browser from running out of memory. Use Structure optimization for larger PDFs.",
  },
];

export default function PdfCompressPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-compress`,
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

  // Fixed: Properly handle JSON serialization for structured data to prevent parsing issues
  const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: structuredDataJson,
        }}
      />
      <PageHeader
        title={title}
        description="Shrink PDF file size with structure optimization or image re-encoding, privately in your browser."
        eyebrow="PDF tool"
        accent="coral"
        icon="C"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfCompress />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Compression happens on your device</h2>
            <p>
              ToolNest reads the PDF, applies your chosen compression, and saves
              the result locally. No server uploads, no account, no tracking.
            </p>
            <ul>
              <li>Structure optimization and image re-encoding</li>
              <li>Up to 1000 pages (structure) or 100 pages (image)</li>
              <li>Browser memory safety limits</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What PDF Compress does</span>
              <h2>Shrink your PDF without leaving your browser</h2>
              <p>
                PDF Compress reduces file size using two approaches. Structure
                optimization re-saves the document with compressed object
                streams, preserving all content. Image re-encoding renders pages
                to JPG at a lower quality for stronger reduction.
              </p>
            </article>
            <article>
              <span className="kicker">Compression levels</span>
              <h2>Pick the right trade-off</h2>
              <p>
                Structure optimization is lossless and best for text-heavy
                documents. Balanced re-renders pages to JPG at 1.5× with 80%
                quality. Strong uses 1× scale with 60% quality for the smallest
                output.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>No upload or server copy</h2>
              <p>
                PDF parsing, canvas rendering, image encoding, and saving all
                happen on your device. ToolNest does not receive or retain the
                document.
              </p>
            </article>
            <article>
              <span className="kicker">Browser limitations</span>
              <h2>Large documents depend on device memory</h2>
              <p>
                Current Chrome, Edge, Firefox, and Safari support the required
                PDF worker, canvas, Blob, and download features. Complex or
                unusually large PDFs may need a desktop browser with more
                available memory.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF Compress FAQs</h2>
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
