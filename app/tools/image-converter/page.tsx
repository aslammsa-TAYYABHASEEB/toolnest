import type { Metadata } from "next";
import { ImageConverter } from "@/components/image-converter";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Image Converter";
const description = "Convert JPG, PNG, and WebP images directly in your browser. Keep transparency where supported and download the result in seconds.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/image-converter" },
  openGraph: { title: `${title} | ${siteConfig.name}`, description, url: "/tools/image-converter", type: "website" },
};

const faqs = [
  { question: "Are my images uploaded?", answer: "No. Conversion happens locally in your browser, so the selected image never leaves your device." },
  { question: "Which image formats can I convert?", answer: "You can open and export JPG/JPEG, PNG, and WebP images." },
  { question: "What happens to transparency?", answer: "PNG and WebP output can keep transparent areas. Because JPG does not support transparency, transparent areas are placed on a white background." },
  { question: "Why might the converted file be larger?", answer: "File size depends on the image content, chosen format, and quality. PNG is lossless and can be larger than JPG or WebP for photographs." },
];

export default function ImageConverterPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: title, applicationCategory: "MultimediaApplication", operatingSystem: "Any with a modern web browser", url: `${siteConfig.url}/tools/image-converter`, description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      { "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <PageHeader title={title} description="Convert JPG, PNG, and WebP images without uploading them." eyebrow="Image tool" accent="violet" icon="IMG" />
      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <ImageConverter />
          <aside className="tool-side-note">
            <span className="kicker">Private by design</span>
            <h2>Fast conversion, on your device</h2>
            <p>ToolNest uses your browser’s built-in image and canvas features. There is no upload step, account, or server queue.</p>
            <ul><li>One image at a time</li><li>Up to 20 MB</li><li>JPG, PNG, and WebP</li></ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article><span className="kicker">What it does</span><h2>Change image formats in a few taps</h2><p>Image Converter turns JPG, PNG, and WebP files into the format you need. Choose a quality level for JPG or WebP, preview the source details, and download the new file when it is ready.</p></article>
            <article><span className="kicker">How to use it</span><h2>Three simple steps</h2><ol><li>Select or drop one supported image.</li><li>Choose JPG, PNG, or WebP and adjust quality when available.</li><li>Convert, review the output size, and download your image.</li></ol></article>
          </div>
          <div className="format-guide"><h2>Supported formats</h2><div><article><strong>JPG / JPEG</strong><p>Best for photos and compact sharing. Transparent areas become white.</p></article><article><strong>PNG</strong><p>Lossless output that preserves transparent areas.</p></article><article><strong>WebP</strong><p>Modern, efficient output with quality control and transparency support.</p></article></div></div>
          <div className="faq-section"><span className="kicker">Helpful answers</span><h2>Image Converter FAQs</h2><div>{faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div>
        </div>
      </section>
    </>
  );
}
