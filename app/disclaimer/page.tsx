import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
export const metadata: Metadata = { title: "Disclaimer", description: "Disclaimer placeholder for ToolNest." };
export default function Page() { return <LegalPage title="Disclaimer" intro="Important context about the general-purpose information and tools planned for ToolNest." sections={[
  { heading: "General information", body: "ToolNest content and planned tools are intended for general informational and convenience purposes only." },
  { heading: "No professional advice", body: "Nothing on this website should be treated as legal, medical, financial, or other professional advice." },
  { heading: "Accuracy and responsibility", body: "Visitors should independently check important results. This placeholder will be replaced with a complete disclaimer before launch." },
]} />; }
