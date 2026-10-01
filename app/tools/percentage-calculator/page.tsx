import type { Metadata } from "next";
import { PercentageCalculator } from "@/components/percentage-calculator";
import { PageHeader } from "@/components/ui/page-header";
import { ToolPageShell } from "@/components/ui/tool-page-shell";
import { TrustStrip } from "@/components/ui/trust-strip";
import { RelatedTools } from "@/components/related-tools";
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

      <ToolPageShell
        trust={
          <TrustStrip
            label="Local calculation"
            title="Calculated on this device"
            description="Entered values and results remain in this browser session."
          />
        }
      >
        <PercentageCalculator />
      </ToolPageShell>

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
      <RelatedTools currentHref="/tools/percentage-calculator" />
    </>
  );
}
