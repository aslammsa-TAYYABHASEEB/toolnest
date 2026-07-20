import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
export const metadata: Metadata = { title: "Privacy Policy", description: "Privacy Policy placeholder for ToolNest." };
export default function Page() { return <LegalPage title="Privacy Policy" intro="A plain-language overview of how ToolNest will approach privacy and data handling." sections={[
  { heading: "Information we collect", body: "This section will explain what information may be collected when you visit or use ToolNest, including basic technical and contact information." },
  { heading: "How information is used", body: "This section will describe how collected information may be used to operate, secure, measure, and improve the service." },
  { heading: "Your choices", body: "This section will outline the choices and controls available to visitors. A final policy will be published before processing tools go live." },
]} />; }
