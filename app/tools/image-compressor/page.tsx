import type { Metadata } from "next";
import { ImageCompressor } from "@/components/image-compressor";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Image Compressor";
const description = "Reduce JPG, PNG, and WebP image file sizes directly in your browser while keeping the original dimensions.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/image-compressor" },
  openGraph: { title: `${title} | ${siteConfig.name}`, description, url: "/tools/image-compressor", type: "website" },
};

const faqs = [
  { question: "Are my images uploaded?", answer: "No. Compression runs locally in your browser, so your image never leaves your device." },
  { question: "Will compression change my image dimensions?", answer: "No. Image Compressor keeps the original width and height. It changes encoding quality for JPG and WebP, or attempts a lossless re-encode for PNG." },
  { question: "Why is PNG compression limited?", answer: "Browser canvas exports PNG losslessly and does not provide a dependable PNG quality setting. ToolNest never pretends the quality slider can shrink PNG files." },
  { question: "What if the result is larger?", answer: "ToolNest reports that no useful reduction was achieved, shows the size difference, and keeps the original image available to download." },
  { question: "Which quality should I choose?", answer: "Around 75% is a practical starting point. Lower settings usually create smaller files, while higher settings preserve more visual detail." },
];

export default function ImageCompressorPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: title, applicationCategory: "MultimediaApplication", operatingSystem: "Any with a modern web browser", url: `${siteConfig.url}/tools/image-compressor`, description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      { "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <PageHeader title={title} description="Make JPG, PNG, and WebP images smaller without uploading them." eyebrow="Image tool" accent="violet" icon="IMG" />
      <section className="tool-page-section">
        <div className="container tool-page-grid">
          <ImageCompressor />
          <aside className="tool-side-note">
            <span className="kicker">Smaller, still private</span>
            <h2>Compress on your device</h2>
            <p>Your browser handles decoding and re-encoding. Files are never sent to ToolNest or placed in a server queue.</p>
            <ul><li>Original dimensions retained</li><li>Up to 20 MB</li><li>JPG, PNG, and WebP</li></ul>
          </aside>
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article><span className="kicker">What compression means</span><h2>Reduce storage without resizing</h2><p>Image compression changes how image data is encoded so the file can take up less space. JPG and WebP quality controls trade a little visual detail for a smaller file, while the image dimensions stay unchanged.</p></article>
            <article><span className="kicker">How to use it</span><h2>Choose, tune, and compare</h2><ol><li>Select or drop one supported image.</li><li>Choose a quality for JPG or WebP. PNG uses an honest lossless attempt.</li><li>Compress, compare the before-and-after sizes, and download the useful result.</li></ol></article>
          </div>

          <div className="format-guide">
            <h2>Compression by format</h2>
            <div>
              <article><strong>JPG / JPEG</strong><p>Lossy quality compression is effective for photographs and keeps the original dimensions.</p></article>
              <article><strong>PNG</strong><p>Lossless browser re-encoding may offer limited savings. ToolNest reports honestly when it does not.</p></article>
              <article><strong>WebP</strong><p>Lossy quality compression can reduce size while retaining supported transparency.</p></article>
            </div>
          </div>

          <div className="png-explanation">
            <span className="kicker">PNG limitations</span>
            <h2>Why PNG works differently</h2>
            <p>Browsers do not expose a reliable PNG quality control through canvas. This tool keeps PNG output as PNG and attempts a lossless re-encode. It never silently converts your file or claims savings when the result is larger. For a substantially smaller copy, you can deliberately convert the image to WebP with Image Converter.</p>
          </div>

          <div className="faq-section"><span className="kicker">Helpful answers</span><h2>Image Compressor FAQs</h2><div>{faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div>
        </div>
      </section>
    </>
  );
}
