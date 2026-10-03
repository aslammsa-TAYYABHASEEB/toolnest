import type { Metadata } from "next";
import { MailMergeVerifier } from "@/components/mail-merge-verifier";
import { PageHeader } from "@/components/ui/page-header";
import { ToolPageShell } from "@/components/ui/tool-page-shell";
import { RelatedTools } from "@/components/related-tools";

const description = "Check personalized, one-record-per-page native-text PDFs against their source CSV using explicit record keys and labelled fields.";
export const metadata: Metadata = { title:"Mail Merge Verifier",description,alternates:{canonical:"/tools/mail-merge-verifier"},openGraph:{title:"Mail Merge Verifier | ToolNest",description,url:"/tools/mail-merge-verifier",type:"website"} };
export default function MailMergeVerifierPage(){return <>
  <PageHeader title="Verify personalized PDFs against their source CSV" description="Check that each generated document contains the expected record and selected field values before distribution." eyebrow="Mail Merge Verifier" accent="blue" icon="PDF"/>
  <ToolPageShell width="wide"><MailMergeVerifier/></ToolPageShell><RelatedTools currentHref="/tools/mail-merge-verifier"/>
</>}
