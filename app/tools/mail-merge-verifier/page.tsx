import type { Metadata } from "next";
import { MailMergeVerifier } from "@/components/mail-merge-verifier";
import { PageHeader } from "@/components/ui/page-header";
import { ToolPageShell } from "@/components/ui/tool-page-shell";
import { RelatedTools } from "@/components/related-tools";
import { siteConfig } from "@/lib/site";

const title = "Mail Merge Verifier – Check PDFs Against CSV";
const description = "Check final, one-record-per-page searchable PDFs against source CSV rows in your browser, with record-by-record field checks and PDF-page evidence.";
export const metadata: Metadata = { title,description,alternates:{canonical:"/tools/mail-merge-verifier"},openGraph:{title:`${title} | ${siteConfig.name}`,description,url:"/tools/mail-merge-verifier",type:"website"},twitter:{card:"summary",title:`${title} | ${siteConfig.name}`,description} };
export default function MailMergeVerifierPage(){
  const structuredData = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Mail Merge Verifier", applicationCategory: "BusinessApplication", operatingSystem: "Web browser", url: `${siteConfig.url}/tools/mail-merge-verifier`, description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } };
  return <>
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
  <PageHeader title="Verify personalized PDFs against their source CSV" description="Choose your source CSV and the final PDF generated elsewhere. Check each record’s key and selected field values, with source-row and PDF-page evidence." eyebrow="Mail Merge Verifier" accent="blue" icon="PDF"/>
  <ToolPageShell width="wide"><MailMergeVerifier/></ToolPageShell><RelatedTools currentHref="/tools/mail-merge-verifier"/>
</>}
