import type { Metadata } from "next";
import { CaseConverter } from "@/components/case-converter";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Case Converter – Switch Uppercase, Lowercase & Title Case";
const description = "Convert text between UPPERCASE, lowercase, Title Case, Sentence case, camelCase, kebab-case, and snake_case instantly in your browser.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/case-converter" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/case-converter",
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
    question: "Is my text converted privately?",
    answer: "Yes. All text conversions run strictly inside your browser using client-side JavaScript. No text is uploaded to any server.",
  },
  {
    question: "What case styles are supported?",
    answer: "UPPERCASE, lowercase, Title Case, Sentence case, camelCase, kebab-case, snake_case, and CONSTANT_CASE.",
  },
  {
    question: "Can I convert code variable names?",
    answer: "Yes. Converting strings like 'user_first_name' to camelCase ('userFirstName') or kebab-case ('user-first-name') is fully supported.",
  },
];

export default function CaseConverterPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Case Converter",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/case-converter`,
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
        title="Case Converter"
        description="Switch text instantly between uppercase, lowercase, title case, sentence case, camelCase, kebab-case, and snake_case."
        eyebrow="Text tool"
        accent="blue"
        icon="Aa"
      />

      <section className="tool-page-section">
        <div className="container">
          <CaseConverter />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Change text casing with 1-click presets</h2>
              <p>Easily transform headlines, code variables, lists, or paragraphs into clean uppercase, lowercase, title case, or programming naming conventions.</p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Convert case in three steps</h2>
              <ol>
                <li>Type or paste text into the source panel.</li>
                <li>Select your desired case style preset.</li>
                <li>Copy the transformed output or download it as a file.</li>
              </ol>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>Case Converter FAQs</h2>
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
