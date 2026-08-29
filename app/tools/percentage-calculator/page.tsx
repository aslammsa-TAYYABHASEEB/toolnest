import type { Metadata } from "next";
import { PercentageCalculator } from "@/components/percentage-calculator";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Percentage Calculator – Find Percent, Value, and Change";
const description =
  "Calculate percentages, find what percent a value is of a whole, and compute percentage increase or decrease. All calculations happen privately in your browser.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/percentage-calculator" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/percentage-calculator",
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
    question: "Are my calculations sent to a server?",
    answer:
      "No. The Percentage Calculator performs all computations locally in your web browser. Your numbers never leave your device.",
  },
  {
    question: "Can I calculate percentage increase and decrease?",
    answer:
      "Yes. Enter a starting value and ending value to see the percent increase or decrease, with the direction clearly indicated.",
  },
  {
    question: "What if I divide by zero?",
    answer:
      "The calculator handles division by zero gracefully. If you're calculating 'X is what percent of Y' with Y = 0, the result will indicate the operation is undefined.",
  },
  {
    question: "Are my numbers stored or logged?",
    answer:
      "No. All calculations are performed entirely within your browser. No data is collected, stored, or transmitted.",
  },
];

export default function PercentageCalculatorPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Percentage Calculator",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/percentage-calculator`,
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
        title="Percentage Calculator"
        description="Calculate percentages, find what percent a value is of a whole, and compute percentage increase or decrease instantly and privately."
        eyebrow="Calculators"
        accent="green"
        icon="%"
      />

      <section className="tool-page-section">
        <div className="container">
          <PercentageCalculator />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Three types of percentage calculations</h2>
              <p>
                Find what X% of a value is, determine what percent a part is of a whole,
                or calculate the percent increase or decrease between two numbers.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Three steps to percentage mastery</h2>
              <ol>
                <li>Select the calculation type that fits your question</li>
                <li>Enter the numbers in the input fields</li>
                <li>View the live result and description below</li>
              </ol>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}