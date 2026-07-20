import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
export const metadata: Metadata = { title: "Terms of Use", description: "Terms of Use placeholder for ToolNest." };
export default function Page() { return <LegalPage title="Terms of Use" intro="The basic conditions that will govern access to and use of ToolNest." sections={[
  { heading: "Using the service", body: "This section will set out acceptable use, eligibility, and visitor responsibilities when using the website and its tools." },
  { heading: "Availability", body: "This section will explain that features may change and that uninterrupted or error-free availability cannot always be guaranteed." },
  { heading: "Final terms", body: "These terms are an MVP placeholder and will be reviewed and completed before processing features are made available." },
]} />; }
