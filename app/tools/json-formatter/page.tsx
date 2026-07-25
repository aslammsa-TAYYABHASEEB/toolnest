import type { Metadata } from "next";
import { JsonFormatter } from "@/components/json-formatter";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "JSON Formatter & Validator – Format JSON Online";
const description = "Format, minify, and validate JSON securely in your browser. Paste, type, or upload a JSON file and download clean output without server uploads.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/json-formatter" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/json-formatter",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${title} | ${siteConfig.name}`,
    description,
  },
};

const faqs = [
  {
    question: "Is my JSON uploaded to a server?",
    answer: "No. ToolNest reads and processes pasted text and selected JSON files inside your browser. The content is not sent to a ToolNest processing endpoint.",
  },
  {
    question: "What is the difference between format and minify?",
    answer: "Format adds indentation and line breaks for readability. Minify removes unnecessary whitespace to create a compact JSON string.",
  },
  {
    question: "Does the validator show where an error occurred?",
    answer: "When the browser provides a parse position, ToolNest displays the nearby line and column or character number to help locate the problem.",
  },
  {
    question: "Does it support Unicode and Urdu?",
    answer: "Yes. Valid JSON strings can contain Unicode text, including Urdu. Formatting and minifying preserve those characters.",
  },
  {
    question: "How large can an uploaded JSON file be?",
    answer: "The initial browser-safety limit is 20 MB. Processing speed and available memory still depend on the device and browser.",
  },
];

export default function JsonFormatterPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "JSON Formatter & Validator",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/json-formatter`,
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
        title="JSON Formatter & Validator"
        description="Format, minify, validate, copy, and download JSON without sending it away from your device."
        eyebrow="Text tool"
        accent="blue"
        icon="{}"
      />

      <section className="tool-page-section">
        <div className="container">
          <JsonFormatter />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Make JSON easier to read and inspect</h2>
              <p>Paste, type, or upload JSON, then pretty-print it with consistent indentation, minify it for compact storage, or validate its syntax with useful error details.</p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Process JSON in three steps</h2>
              <ol>
                <li>Add JSON in the input editor or select a .json file.</li>
                <li>Choose Format, Minify, or Validate.</li>
                <li>Copy the valid output or download it as a JSON file.</li>
              </ol>
            </article>
          </div>

          <div className="format-guide">
            <h2>Format, minify, or validate</h2>
            <div>
              <article><strong>Format</strong><p>Add two-space indentation and line breaks for clear reading and review.</p></article>
              <article><strong>Minify</strong><p>Remove unnecessary whitespace while preserving the JSON data.</p></article>
              <article><strong>Validate</strong><p>Check syntax and receive a readable error location when the browser provides one.</p></article>
            </div>
          </div>

          <div className="tool-copy-grid json-format-copy">
            <article>
              <span className="kicker">Private by design</span>
              <h2>Processed entirely in your browser</h2>
              <p>A dedicated browser worker parses JSON locally so the page remains responsive. ToolNest does not upload the text or selected files to an API.</p>
            </article>
            <article>
              <span className="kicker">Supported content</span>
              <h2>Standard JSON with Unicode text</h2>
              <p>Use objects, arrays, strings, numbers, booleans, and null values. Unicode content such as Urdu remains readable in formatted and minified output.</p>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>JSON Formatter FAQs</h2>
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
