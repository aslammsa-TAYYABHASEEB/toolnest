import type { Metadata } from "next";
import { QrCodeGenerator } from "@/components/qr-code-generator";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "QR Code Generator – Create QR Codes Free";
const description = "Create QR codes for links, text, Wi-Fi, email, phone numbers and contacts. Customize and download PNG or SVG QR codes securely in your browser.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/qr-code-generator" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/qr-code-generator",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is my QR code content uploaded?",
    answer: "No. ToolNest generates the QR code inside your browser. The text, contact, Wi-Fi, or other content you enter is not sent to a ToolNest processing server.",
  },
  {
    question: "Can I create a QR code in Urdu?",
    answer: "Yes. The generator supports Unicode text, including Urdu and other languages. Longer multibyte text may reach QR capacity sooner than short English text.",
  },
  {
    question: "What is the difference between PNG and SVG?",
    answer: "PNG is convenient for documents, messages, and social posts. SVG stays sharp at any size and is often better for printing or design software.",
  },
  {
    question: "Which error correction level should I use?",
    answer: "Medium is a sensible default. Higher levels can tolerate more damage but store less content and usually create denser QR codes.",
  },
  {
    question: "Why does color contrast matter?",
    answer: "QR scanners need a clear difference between dark and light modules. A dark foreground on a light background is the most reliable choice.",
  },
];

export default function QrCodeGeneratorPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "QR Code Generator",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/qr-code-generator`,
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
        title="QR Code Generator"
        description="Create customized QR codes for text, links, Wi-Fi, messages, and contacts without uploading your content."
        eyebrow="Text tool"
        accent="blue"
        icon="QR"
      />

      <section className="tool-page-section">
        <div className="container">
          <QrCodeGenerator />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Turn useful information into a scannable code</h2>
              <p>Generate QR codes for plain text, websites, email, phone numbers, SMS messages, Wi-Fi access, and contact cards. Adjust the size, quiet zone, colors, and error correction before downloading.</p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Create a QR code in three steps</h2>
              <ol>
                <li>Choose the content type and enter the requested details.</li>
                <li>Review the live preview and adjust its appearance.</li>
                <li>Download PNG or SVG, or copy the PNG when supported.</li>
              </ol>
            </article>
          </div>

          <div className="format-guide">
            <h2>Supported QR code types</h2>
            <div>
              <article><strong>Text and websites</strong><p>Share Unicode text or an http/https link that opens in a browser.</p></article>
              <article><strong>Messages and calls</strong><p>Prepare email, telephone, and SMS actions for compatible devices.</p></article>
              <article><strong>Wi-Fi and contacts</strong><p>Share escaped network credentials or a standards-compatible vCard.</p></article>
            </div>
          </div>

          <div className="tool-copy-grid qr-format-copy">
            <article>
              <span className="kicker">Private by design</span>
              <h2>Generated on your device</h2>
              <p>The QR library and browser rendering APIs run locally after the page loads. ToolNest does not need an account and does not send entered QR content to a processing endpoint.</p>
            </article>
            <article>
              <span className="kicker">Choose a format</span>
              <h2>PNG for convenience, SVG for scale</h2>
              <p>Use PNG for everyday sharing and insertion into common documents. Choose SVG when the QR code needs to remain crisp for print, signage, or large layouts.</p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>QR Code Generator FAQs</h2>
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
