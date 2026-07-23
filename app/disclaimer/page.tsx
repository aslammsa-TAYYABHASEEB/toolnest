import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
const description = "Important limitations and user responsibilities when using ToolNest file-processing tools.";
export const metadata: Metadata = {
  title: "Disclaimer",
  description,
  alternates: { canonical: "/disclaimer" },
  openGraph: { title: "Disclaimer | ToolNest", description, url: "/disclaimer", type: "website" },
};
export default function Page() { return <LegalPage title="Disclaimer" intro="Important limitations to understand before relying on a ToolNest result." sections={[
  { heading: "General-purpose tools", body: "ToolNest provides browser-based utilities for everyday files. Results can vary with source-file structure, browser behavior, available memory, image encoding, and third-party document formats." },
  { heading: "Check important outputs", body: "Review every converted, compressed, resized, merged, split, or rotated file before deleting an original or using the result in an important workflow. Keep backups of source files." },
  { heading: "No professional advice", body: "ToolNest content and results are not legal, medical, financial, compliance, archival, accessibility, or other professional advice. Obtain qualified advice for decisions where accuracy or legal effect matters." },
  { heading: "PDF signatures and advanced features", body: "Saving a modified PDF can invalidate digital signatures. Interactive forms, attachments, scripts, unusual fonts, document-level metadata, and other advanced features may not be preserved identically by every operation." },
  { heading: "Device and browser limits", body: "Large or complex files can exhaust browser memory or fail despite the published safety limits. Password-protected files and unsupported or corrupt formats are intentionally rejected where detected." },
  { heading: "External responsibility", body: "You are responsible for having permission to process files and for protecting any sensitive information on your device. ToolNest cannot control downloaded files after they leave the browser session." },
]} />; }
