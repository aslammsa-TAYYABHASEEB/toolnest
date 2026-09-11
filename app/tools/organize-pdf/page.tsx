import type { Metadata } from "next";
import { PdfOrganize } from "@/components/pdf-organize";
import { PageHeader } from "@/components/ui/page-header";
import { RelatedTools } from "@/components/related-tools";
import { siteConfig } from "@/lib/site";

const title = "Organize PDF – Reorder, Delete & Manage PDF Pages";
const description = "Organize PDF pages directly in your browser. Reorder, delete, rotate, duplicate, extract, and insert pages privately with no file upload.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/tools/organize-pdf" },
  openGraph: { title: `${title} | ToolNest`, description, url: "/tools/organize-pdf", type: "website" },
  twitter: { card: "summary", title: `${title} | ToolNest`, description },
};
const faqs = [
  { question: "How do I reorder PDF pages?", answer: "Choose a PDF and drag a page handle to its new position. You can also use the Previous and Next buttons, or focus a handle and press an arrow key. Export follows the displayed order." },
  { question: "Can I delete, rotate, and duplicate several pages?", answer: "Yes. Select pages in the grid or choose Select all, then use the page actions. Duplicates are placed immediately after their original pages. Undo restores the last edit." },
  { question: "How do I insert another PDF?", answer: "Open Insert pages from another PDF and choose append, before, or after the first selected page. Without a selection, inserted pages append to the end. Invalid files leave the current session unchanged." },
  { question: "Does extracting pages remove them from my document?", answer: "No. Extract selected creates a separate PDF in the current visual order, with your chosen rotations. Your organizer session remains unchanged." },
  { question: "Are files uploaded or converted to images?", answer: "No. All processing takes place on your device. Preview thumbnails are images, but export copies the original PDF pages, preserving selectable text, vector artwork, page sizes, and page rotations." },
  { question: "Can I undo or reset my changes?", answer: "Undo restores up to 20 recent edits. Reset document restores the first PDF and can itself be undone. Clear session releases all source files and edits; keep your original files for later use." },
  { question: "What limits apply?", answer: "The session accepts up to 100 MB of source files and 500 imported pages, with at most 500 pages in the organized output. Previews load in batches of 24. Export is limited to 200 MB. Encrypted, corrupt, and empty PDFs are rejected. Complex documents may still exceed your device memory." },
  { question: "Will forms, signatures, or bookmarks be preserved?", answer: "Document-level interactive forms, digital signatures, bookmarks, and internal links may not survive copying or reordering pages. This tool is intended for managing ordinary PDF page content, not preserving signed or interactive document workflows." },
];
export default function OrganizePdfPage() {
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", name: "Organize PDF", applicationCategory: "BusinessApplication", operatingSystem: "Any with a modern web browser", url: `${siteConfig.url}/tools/organize-pdf`, description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ] };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <PageHeader title="Organize PDF" description="Put every page in its place. Reorder, rotate, remove, and combine pages in one private workspace." eyebrow="PDF tool" accent="coral" icon="▦" />
    <section className="tool-page-section"><div className="container"><PdfOrganize /></div></section>
    <section className="section section-tint tool-content"><div className="container">
      <div className="tool-copy-grid"><article><span className="kicker">Simple workflow</span><h2>Choose. Arrange. Download.</h2><p>Start with a PDF, select the pages you want to change, and create your organized document. The numbered grid always shows the output order.</p></article><article><span className="kicker">Original quality</span><h2>Previews are not the output</h2><p>Small previews keep the workspace responsive. Your download copies original PDF pages without rasterization, including mixed portrait and landscape page sizes.</p></article><article><span className="kicker">Private by design</span><h2>Nothing to upload</h2><p>PDF parsing, page changes, and downloads happen in your browser. No account, paid OCR service, or server processing is required.</p></article></div>
      <div className="faq-section"><span className="kicker">Helpful answers</span><h2>Organize PDF FAQs</h2>{faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </div></section><RelatedTools currentHref="/tools/organize-pdf" />
  </>;
}
