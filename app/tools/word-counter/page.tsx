import type { Metadata } from "next";
import { WordCounter } from "@/components/word-counter";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Word Counter – Count Words, Characters, Sentences & Reading Time";
const description = "Count words, characters, sentences, paragraphs, reading time, and keyword density privately in your browser without uploading text.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/word-counter" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/word-counter",
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
    question: "Is my text sent to any server?",
    answer: "No. ToolNest counts words and analyzes text statistics entirely inside your web browser. Your text never leaves your device.",
  },
  {
    question: "How is reading time calculated?",
    answer: "Reading time is calculated based on an average adult reading speed of 200 words per minute. Speaking time is based on 130 words per minute.",
  },
  {
    question: "Does it support non-English languages and Urdu?",
    answer: "Yes. Unicode text, non-Latin scripts (including Urdu, Arabic, Chinese), and emojis are analyzed correctly.",
  },
  {
    question: "Can I upload a document to count words?",
    answer: "Yes. You can upload any plain text (.txt, .md, .csv) file up to 10 MB.",
  },
];

export default function WordCounterPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Word Counter",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/word-counter`,
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
        title="Word Counter"
        description="Count words, characters, sentences, paragraphs, reading time, and keyword frequency instantly and privately."
        eyebrow="Text tool"
        accent="blue"
        icon="W"
      />

      <section className="tool-page-section">
        <div className="container">
          <WordCounter />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Analyze document length and reading speed</h2>
              <p>Type or paste text to inspect word counts, character limits (with and without spaces), sentence totals, reading duration, and keyword distribution.</p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Count words in three steps</h2>
              <ol>
                <li>Paste text into the editor or upload a .txt file.</li>
                <li>View real-time metric cards and keyword density stats.</li>
                <li>Copy the analyzed text or save it to your device.</li>
              </ol>
            </article>
          </div>

          <div className="faq-section">
            <span className="kicker">Helpful answers</span>
            <h2>Word Counter FAQs</h2>
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
