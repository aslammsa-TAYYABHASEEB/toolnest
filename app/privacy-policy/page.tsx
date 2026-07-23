import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
const description = "How ToolNest handles browser-local files, site preferences, technical requests, and contact information.";
export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy-policy" },
  openGraph: { title: "Privacy Policy | ToolNest", description, url: "/privacy-policy", type: "website" },
};
export default function Page() { return <LegalPage title="Privacy Policy" intro="How ToolNest protects files and explains the limited information involved in operating the website." sections={[
  { heading: "Browser-local file processing", body: "The available image and PDF tools process selected files inside your browser. ToolNest does not upload file contents to an application server, store copies, or use them for analytics, advertising, or model training." },
  { heading: "Website requests", body: "Like most websites, the hosting provider may process basic technical request information such as IP address, browser type, requested URL, and timestamps to deliver and secure the site. ToolNest does not currently add application analytics or tracking pixels." },
  { heading: "Device preferences", body: "The theme control stores a light, dark, or system preference in your browser local storage. This preference stays on your device and can be removed through browser settings." },
  { heading: "Contact information", body: "If you contact ToolNest by email, the address and message you provide are used to respond and maintain necessary support records. Do not email confidential files or sensitive personal information." },
  { heading: "Security and retention", body: "ToolNest uses browser safety limits and local object-URL cleanup to reduce risk during file processing. No website can guarantee absolute security; support correspondence and hosting logs should be retained only as long as operationally necessary." },
  { heading: "Changes and questions", body: "This policy may be updated as the service changes. The revision date will be updated when material changes are published. Privacy questions can be sent through the Contact page." },
]} />; }
