import type { Metadata } from "next";
import { UnitConverter } from "@/components/unit-converter";
import { PageHeader } from "@/components/ui/page-header";
import { RelatedTools } from "@/components/related-tools";
import { siteConfig } from "@/lib/site";

const title = "Unit Converter – Convert Length, Weight, and Temperature";
const description =
  "Convert between common length, weight, and temperature units instantly and privately in your browser. Supports metric and imperial units with live results.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools/unit-converter" },
  openGraph: {
    title: `${title} | ${siteConfig.name}`,
    description,
    url: "/tools/unit-converter",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${title} | ${siteConfig.name}`,
    description,
  },
};

export default function UnitConverterPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Unit Converter",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Any with a modern web browser",
        url: `${siteConfig.url}/tools/unit-converter`,
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
        title="Unit Converter"
        description="Convert between common length, weight, and temperature units instantly and privately."
        eyebrow="Calculators"
        accent="green"
        icon="⇄"
      />

      <section className="tool-page-section">
        <div className="container">
          <UnitConverter />
        </div>
      </section>

      <section className="section section-tint tool-content">
        <div className="container">
          <div className="tool-copy-grid">
            <article>
              <span className="kicker">What it does</span>
              <h2>Three categories, live results</h2>
              <p>
                Switch between Length, Weight, and Temperature and convert any
                value instantly. Enter a number in the "From" field and see the
                result update live in the "To" field — no buttons to press.
              </p>
            </article>
            <article>
              <span className="kicker">How to use it</span>
              <h2>Three steps to any conversion</h2>
              <ol>
                <li>Select a category: Length, Weight, or Temperature</li>
                <li>Pick your from/to units and enter a value</li>
                <li>Read the live result, or swap the direction with one click</li>
              </ol>
            </article>
          </div>
        </div>
      </section>
      <RelatedTools currentHref="/tools/unit-converter" />
    </>
  );
}
