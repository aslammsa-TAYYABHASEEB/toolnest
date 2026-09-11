import type { Metadata } from "next";
import { ImageToText } from "@/components/image-to-text";
import { PageHeader } from "@/components/ui/page-header";
import { RelatedTools } from "@/components/related-tools";
import { siteConfig } from "@/lib/site";

const title = "Image to Text – Extract Text from Images with OCR";
const description = "Extract text from JPG, PNG and WebP images directly in your browser. Copy or download recognized text with private on-device OCR and no image upload.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/tools/image-to-text" },
  openGraph: { title: `${title} | ToolNest`, description, url: "/tools/image-to-text", type: "website" },
  twitter: { card: "summary", title: `${title} | ToolNest`, description },
};
const faqs = [
  { question: "What image formats are supported?", answer: "Choose a JPG/JPEG, PNG, or WebP image up to 20 MB, 24 megapixels, and 10,000 pixels per side. Files are checked before OCR. Other formats must be exported to a supported format using an application that can read them." },
  { question: "Are my images uploaded?", answer: "No. Image contents stay on your device and are processed in your browser. The OCR worker and core load from ToolNest; English language and optional orientation model data may download from Tesseract's CDN. There is no external OCR API." },
  { question: "Can I extract text from screenshots?", answer: "Yes. Select or drop a screenshot, or paste a copied image while the workspace is focused. Clear, high-resolution English text gives the most useful results." },
  { question: "Does it work with scanned documents?", answer: "Yes, for scans saved as JPG, PNG, or WebP. It preserves recognized lines and paragraphs as editable plain text. Use PDF to Word for PDF files. Tables, multiple columns, handwriting, and unusual typography may not retain their layout." },
  { question: "Why does OCR sometimes make mistakes?", answer: "Blur, tiny letters, shadows, skew, handwriting, and decorative fonts can confuse OCR. Check important wording, names, and numbers. The tool does not silently correct spelling or promise an accuracy score." },
  { question: "Does OCR require internet?", answer: "First use needs internet to load the engine and English model data. Your browser may cache language data for later use, but offline operation is not guaranteed. Your image is never included in those downloads." },
  { question: "Can I copy or download the result?", answer: "Yes. Edit the recognized text, copy it to your clipboard, or download a UTF-8 .txt file. Word and character counts update as you edit. Reset removes the current image and result from the workspace." },
  { question: "Which languages and rotations are supported?", answer: "English is supported. The browser applies supported image orientation metadata; you can also rotate by 90, 180, or 270 degrees. Automatic orientation compares alternatives when the first reading is weak, but cannot reliably correct perspective or skew." },
];
export default function ImageToTextPage() {
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", name: "Image to Text", applicationCategory: "MultimediaApplication", operatingSystem: "Any with a modern web browser", url: `${siteConfig.url}/tools/image-to-text`, description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ] };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <PageHeader title="Image to Text" description="Extract the words from a photo, scan, or screenshot. Review, edit, and keep the text—all on your device." eyebrow="Image tool" accent="violet" icon="Aa" />
    <section className="tool-page-section"><div className="container"><ImageToText /></div></section>
    <section className="section section-tint tool-content"><div className="container">
      <div className="tool-copy-grid"><article><span className="kicker">Simple workflow</span><h2>Choose. Read. Reuse.</h2><p>Drop an image, select Extract Text, then check the result against your original. Copy the words into another document or save a text file.</p></article><article><span className="kicker">Useful everyday OCR</span><h2>From screenshots to scanned pages</h2><p>Turn a JPG photo or PNG screenshot into editable English text. Clean, upright images work best. Your original file stays unchanged.</p></article><article><span className="kicker">Honest results</span><h2>Recognized, not rewritten</h2><p>No dictionary silently changes your text. OCR may misread letters and numbers, so review important content before using it.</p></article></div>
      <div className="faq-section"><span className="kicker">Helpful answers</span><h2>Image to Text FAQs</h2>{faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </div></section><RelatedTools currentHref="/tools/image-to-text" />
  </>;
}
