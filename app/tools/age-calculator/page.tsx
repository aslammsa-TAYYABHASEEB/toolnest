import type { Metadata } from "next";
import { AgeCalculator } from "@/components/age-calculator";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/lib/site";

const title = "Age Calculator – Calculate Exact Age in Years, Months, and Days";
const description =
  "Calculate exact age from date of birth in years, months, and days. Also shows total days lived, weeks, months, and a countdown to the next birthday. All calculations happen privately in your browser.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/age-calculator" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/age-calculator",
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
    question: "How is the age calculated?",
    answer:
      "The calculator finds the exact difference between the birth date and the target date in calendar years, months, and days — accounting for varying month lengths and leap years. For someone born on February 29, non-leap years treat February 28 as the anniversary.",
  },
  {
    question: "What if I leave the 'as of' date empty?",
    answer:
      "The 'as of' date defaults to today's date, so you can enter just a birth date and immediately see the current age.",
  },
  {
    question: "Are my dates sent to a server?",
    answer:
      "No. All calculations are performed locally in your web browser. Your dates never leave your device.",
  },
  {
    question: "Can I calculate age between any two dates?",
    answer:
      "Yes. Enter any birth date and any 'as of' date (today or earlier). The birth date must be on or before the 'as of' date.",
  },
];

export default function AgeCalculatorPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Age Calculator",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/age-calculator`,
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
        title="Age Calculator"
        description="Calculate exact age from date of birth in years, months, and days — plus total days lived and a next-birthday countdown."
        eyebrow="Calculators"
        accent="green"
        icon="A"
      />

      <section className="tool-page-section">
        <div className="container">
          <AgeCalculator />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Exact age, down to the day</h2>
              <p>
                Enter a date of birth and get the precise age in years, months, and
                days. The calculator also shows total days lived, total weeks, total
                months, and counts down the days until the next birthday.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Two fields, instant results</h2>
              <ol>
                <li>Enter the date of birth in the first field</li>
                <li>Optionally pick an "as of" date (defaults to today)</li>
                <li>View the full age breakdown and next-birthday countdown</li>
              </ol>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
