import type { Metadata } from "next";
import { TextCleaner } from "@/components/text-cleaner";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Remove Extra Spaces – Clean Whitespace & Blank Lines";
const description = "Strip duplicate spaces, remove blank lines, trim trailing whitespace, and normalize line breaks in your browser without uploading text.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/remove-extra-spaces" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/remove-extra-spaces",
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
    question: "Is my text processed securely?",
    answer: "Yes. All text cleanup operations happen locally inside your browser using client-side JavaScript. No text is sent across the internet.",
  },
  {
    question: "What whitespace features are included?",
    answer: "You can remove double/multiple spaces, trim line padding, delete empty lines, and convert Windows line endings (\\r\\n) to Unix (\\n).",
  },
  {
    question: "Can I clean large code blocks or documents?",
    answer: "Yes. You can paste text or upload text files up to 10 MB.",
  },
];

export default function RemoveExtraSpacesPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Remove Extra Spaces",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/remove-extra-spaces`,
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
        title="Remove Extra Spaces"
        description="Clean untidy text by stripping repeated spaces, removing empty lines, and trimming trailing whitespace."
        eyebrow="Text tool"
        accent="blue"
        icon="¶"
      />

      <section className="tool-page-section">
        <div className="container">
          <TextCleaner />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Clean untidy paragraphs and line formatting</h2>
              <p>Remove double spaces, tabs, unwanted blank lines, and trailing padding from raw copy, code snippets, or exported documents.</p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Clean text in three steps</h2>
              <ol>
                <li>Paste untidy text into the source input panel.</li>
                <li>Select the desired whitespace cleaning options.</li>
                <li>Copy the cleaned result or download it to your computer.</li>
              </ol>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>Remove Extra Spaces FAQs</h2>
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
