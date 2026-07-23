import type { Metadata } from "next";
import { PdfRotate } from "@/components/pdf-rotate";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "PDF Rotate";
const description = "Rotate all or selected PDF pages locally in your browser while preserving vector text, page order, dimensions, and document quality.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/pdf-rotate" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/pdf-rotate",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is my PDF uploaded?",
    answer: "No. ToolNest reads page orientation, creates previews, applies rotation metadata, and saves the result locally in your browser.",
  },
  {
    question: "Does rotating reduce PDF quality?",
    answer: "No raster conversion is used for the output. Rotation is stored as page metadata, preserving vector text, graphics, dimensions, and original page content.",
  },
  {
    question: "Can I rotate only selected pages?",
    answer: "Yes. Enter pages such as 1,3-5,8, click page cards, or select every page. The text field and visible page-card selection stay synchronized.",
  },
  {
    question: "What happens to pages that are already rotated?",
    answer: "The tool combines the existing orientation with your pending adjustment. For example, an existing 90-degree page plus another clockwise turn becomes 180 degrees.",
  },
  {
    question: "Why are only some thumbnails shown for a large PDF?",
    answer: "ToolNest previews the first 40 pages to keep memory and scrolling practical. Text selection and Select all still rotate pages beyond the preview.",
  },
  {
    question: "Can I rotate a password-protected PDF?",
    answer: "No. Unlock encrypted or password-protected PDFs in an appropriate application before using this browser tool.",
  },
  {
    question: "Will rotating affect an existing digital signature?",
    answer: "Saving a modified PDF generally invalidates existing digital signatures, even though page content remains vector-based and is not rasterized.",
  },
];

export default function PdfRotatePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/pdf-rotate`,
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
        description="Turn all or selected PDF pages clockwise, counter-clockwise, or 180 degrees without flattening the document."
        eyebrow="PDF tool"
        accent="coral"
        icon="↷"
      />

      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <PdfRotate />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Orientation changes, quality stays</h2>
            <p>
              ToolNest uses PDF page metadata for the saved document, so text
              and vector graphics are not turned into images.
            </p>
            <ul>
              <li>Clockwise, counter-clockwise, and 180°</li>
              <li>All, selected, or individual pages</li>
              <li>Up to 100 MB and 500 pages</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">How PDF rotation works</span>
              <h2>Change orientation without rebuilding page content</h2>
              <p>
                PDF Rotate updates each chosen page’s rotation metadata. The
                page order, dimensions, selectable text, vector graphics, and
                unmodified pages remain intact.
              </p>
            </article>
            <article>
              <span className="kicker">Clockwise and counter-clockwise</span>
              <h2>Turn pages in either direction</h2>
              <p>
                Clockwise adds 90 degrees; counter-clockwise subtracts 90
                degrees. A 180-degree action flips pages, while Reset removes
                only your pending adjustment.
              </p>
            </article>
            <article>
              <span className="kicker">Selected pages</span>
              <h2>Fix one page, a range, or the whole document</h2>
              <p>
                Type page expressions, click compact previews, or select all.
                Reverse ranges are normalized, duplicate pages are removed, and
                document order is preserved.
              </p>
            </article>
            <article>
              <span className="kicker">Existing orientation</span>
              <h2>Original and pending rotations stay clear</h2>
              <p>
                Every preview reports the existing orientation, your pending
                change, and the final effective rotation that will be saved.
              </p>
            </article>
            <article>
              <span className="kicker">Privacy</span>
              <h2>Your document stays on your device</h2>
              <p>
                Validation, preview rendering, page selection, PDF saving, and
                download preparation happen locally. ToolNest does not receive
                or retain the document.
              </p>
            </article>
            <article>
              <span className="kicker">Browser limitations</span>
              <h2>Large documents depend on device memory</h2>
              <p>
                Current Chrome, Edge, Firefox, and Safari support the required
                APIs. Complex or unusually large PDFs may need a desktop browser
                with more available memory.
              </p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>PDF Rotate FAQs</h2>
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
