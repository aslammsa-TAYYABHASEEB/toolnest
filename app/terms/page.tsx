import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
const description = "The conditions for using ToolNest browser-based image and PDF tools.";
export const metadata: Metadata = {
  title: "Terms of Use",
  description,
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of Use | ToolNest", description, url: "/terms", type: "website" },
};
export default function Page() { return <LegalPage title="Terms of Use" intro="The conditions that apply when you access ToolNest and use its browser-based tools." sections={[
  { heading: "Using ToolNest", body: "You may use ToolNest for lawful personal or business purposes. You are responsible for the files you choose, the rights needed to process them, and checking outputs before relying on or sharing them." },
  { heading: "Local processing and backups", body: "Available tools run in your browser and create new downloads without changing the original file. Keep independent backups: browser, device, memory, or document limitations can interrupt processing or produce an unusable result." },
  { heading: "Acceptable use", body: "Do not use ToolNest to violate law, privacy, intellectual-property rights, or security; interfere with the website; distribute malware; or attempt unauthorized access to systems or other users' data." },
  { heading: "Availability and changes", body: "ToolNest may change, limit, suspend, or remove features and safety limits. Continuous, error-free operation and compatibility with every file, browser, or device are not guaranteed." },
  { heading: "No warranties", body: "ToolNest is provided on an as-available basis for general convenience. To the extent permitted by applicable law, no warranty is made that results will be accurate, complete, suitable for a particular purpose, or free from defects." },
  { heading: "Responsibility and contact", body: "You remain responsible for reviewing outputs and protecting important data. Questions about these terms can be sent through the Contact page. Continued use after published changes means the updated terms apply." },
]} />; }
