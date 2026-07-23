import type { Metadata } from "next";
import { ImageResizer } from "@/components/image-resizer";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Image Resizer";
const description = "Resize JPG, PNG, and WebP images by exact pixel dimensions or percentage directly in your browser.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/image-resizer" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/image-resizer",
    type: "website",
  },
};

const faqs = [
  {
    question: "Are my images uploaded?",
    answer: "No. Resizing happens locally in your browser, so the selected image never leaves your device.",
  },
  {
    question: "Should I resize by pixels or percentage?",
    answer: "Use pixels when you need an exact width and height. Use percentage when you want a quick proportional scale, such as half size at 50%.",
  },
  {
    question: "What does locking the aspect ratio do?",
    answer: "It keeps the original width-to-height relationship. Changing one dimension automatically updates the other so the image does not look stretched.",
  },
  {
    question: "What happens to transparency?",
    answer: "PNG and WebP output can preserve transparent areas. JPG does not support transparency, so transparent areas are placed on a white background.",
  },
  {
    question: "Why are very large dimensions blocked?",
    answer: "Extremely large canvases can exhaust browser memory or fail differently across devices. ToolNest limits output to 16,384 pixels per side and 64 megapixels.",
  },
];

export default function ImageResizerPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: title,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/image-resizer`,
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
        description="Resize JPG, PNG, and WebP images without uploading them."
        eyebrow="Image tool"
        accent="violet"
        icon="IMG"
      />
      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <ImageResizer />
          <aside className="tool-side-note">
            <span className="kicker">Precise and private</span>
            <h2>Resize on your device</h2>
            <p>
              Set exact dimensions or choose a percentage. Your browser performs
              every step without an upload or server queue.
            </p>
            <ul>
              <li>Aspect ratio lock</li>
              <li>Up to 20 MB</li>
              <li>JPG, PNG, and WebP</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What resizing means</span>
              <h2>Change the number of pixels in an image</h2>
              <p>
                Image Resizer creates a new copy at your chosen width and height.
                Smaller dimensions are useful for websites, email, and storage;
                larger dimensions add pixels but cannot restore detail missing
                from the original.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Choose, size, and download</h2>
              <ol>
                <li>Select or drop one supported image.</li>
                <li>Enter exact pixel dimensions or choose a scale percentage.</li>
                <li>Review the target size, resize, and download the new copy.</li>
              </ol>
            </article>
            <article>
              <span className="kicker">Pixels or percentage?</span>
              <h2>Pick the measurement that fits your task</h2>
              <p>
                Pixel dimensions are best for a precise requirement such as
                1200 × 800. Percentage scaling is faster when you simply need
                half size, double size, or another proportional change.
              </p>
            </article>
            <article>
              <span className="kicker">Aspect ratio</span>
              <h2>Keep natural proportions</h2>
              <p>
                The aspect ratio lock is on by default. It keeps width and height
                in sync to prevent stretching. Unlock it only when a specific
                non-proportional size is intentional.
              </p>
            </article>
          </div>

          <div className="format-guide">
            <h2>Supported formats</h2>
            <div>
              <article>
                <strong>JPG / JPEG</strong>
                <p>Compact output for photos. Transparent areas become white.</p>
              </article>
              <article>
                <strong>PNG</strong>
                <p>Lossless output that preserves supported transparency.</p>
              </article>
              <article>
                <strong>WebP</strong>
                <p>Efficient quality-controlled output with transparency support.</p>
              </article>
            </div>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>Image Resizer FAQs</h2>
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
