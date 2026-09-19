"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toPdfProcessingError } from "@/lib/pdf/errors";
import { inspectPdfPrivacy } from "@/lib/pdf/privacy-inspect";
import { PRIVACY_LIMITS } from "@/lib/pdf/privacy-objects";
import type { PrivacyFinding, PrivacyInspection } from "@/lib/pdf/privacy-types";
import {
  EMPTY_PRIVACY_SELECTION,
  groupPrivacyFindings,
  quickCleanSelection,
  runPrivacySanitization,
  type PrivacyGroupKey,
  type PrivacySelection,
  type PrivacyWorkflowResult,
} from "@/lib/pdf/privacy-workflow";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";

type Status = "idle" | "ready" | "inspecting" | "inspected" | "sanitizing" | "complete" | "error";
const supportedKeys = new Set<PrivacyGroupKey>(["metadata", "attachments", "activeContent", "comments"]);

function evidenceText(finding: PrivacyFinding) {
  return Object.entries(finding.evidence ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

function concernLabel(finding: PrivacyFinding) {
  return finding.concern === "high" ? "Important" : finding.concern === "review" ? "Review" : "Information";
}

export function DocumentPrivacy() {
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const [source, setSource] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [inspection, setInspection] = useState<PrivacyInspection | null>(null);
  const [selection, setSelection] = useState<PrivacySelection>(EMPTY_PRIVACY_SELECTION);
  const [commentAcknowledged, setCommentAcknowledged] = useState(false);
  const [result, setResult] = useState<PrivacyWorkflowResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const download = usePdfDownload();
  const busy = status === "inspecting" || status === "sanitizing";
  const groups = useMemo(() => inspection ? groupPrivacyFindings(inspection) : [], [inspection]);
  const chosen = Object.values(selection).filter(Boolean).length;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function clearOutput() {
    download.clear();
    setResult(null);
  }

  function choosePdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    clearOutput(); setInspection(null); setSelection(EMPTY_PRIVACY_SELECTION); setCommentAcknowledged(false); setError(""); setMessage("");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setSource(null); setStatus("error"); setError("Choose a PDF file."); return;
    }
    if (file.size > PRIVACY_LIMITS.fileBytes) {
      setSource(null); setStatus("error"); setError("Choose a PDF smaller than 25 MB for private browser inspection."); return;
    }
    setSource(file); setStatus("ready");
    if (inputRef.current) inputRef.current.value = "";
  }

  function reset() {
    clearOutput(); setSource(null); setInspection(null); setSelection(EMPTY_PRIVACY_SELECTION); setCommentAcknowledged(false);
    setError(""); setMessage(""); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function inspect() {
    if (!source || busy) return;
    clearOutput(); setInspection(null); setSelection(EMPTY_PRIVACY_SELECTION); setCommentAcknowledged(false); setError("");
    setMessage("Inspecting document structure, pages, text, annotations, and embedded objects…"); setStatus("inspecting");
    try {
      const next = await inspectPdfPrivacy(source);
      if (!alive.current) return;
      setInspection(next); setStatus("inspected"); setMessage(`Inspection complete: ${next.findings.length} finding${next.findings.length === 1 ? "" : "s"} across ${next.pageCount} page${next.pageCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      if (!alive.current) return;
      setStatus("error"); setError(toPdfProcessingError(caught, "This PDF could not be inspected.").message); setMessage("");
    }
  }

  function toggle(key: keyof PrivacySelection, checked: boolean) {
    clearOutput(); setSelection(current => ({ ...current, [key]: checked }));
    if (key === "comments" && !checked) setCommentAcknowledged(false);
  }

  function selectQuickClean() {
    if (!inspection) return;
    clearOutput(); setSelection(quickCleanSelection(inspection)); setCommentAcknowledged(false);
    setMessage("Quick Clean selected metadata, embedded files, and dangerous active actions that were found. Comments remain unselected.");
  }

  async function sanitize() {
    if (!source || !inspection || busy || !chosen || (selection.comments && !commentAcknowledged)) return;
    clearOutput(); setError(""); setStatus("sanitizing");
    try {
      const next = await runPrivacySanitization(source, selection, (key, completed, total) => {
        if (!alive.current) return;
        const labels = { metadata: "Removing metadata and XMP", attachments: "Removing embedded files", activeContent: "Removing JavaScript and Launch actions", comments: "Removing comments and review marks", verifying: "Reinspecting the sanitized copy" };
        setMessage(`${labels[key]}… step ${completed + 1} of ${total}`);
      });
      if (!alive.current) return;
      download.replace(next.blob, next.filename); setResult(next); setInspection(next.inspection); setStatus("complete");
      const failed = next.steps.filter(step => step.status !== "verified-removed").length;
      setMessage(failed ? `Sanitized copy created, but ${failed} selected removal${failed === 1 ? "" : "s"} could not be verified.` : "Sanitized copy created and all selected removals were verified.");
    } catch (caught) {
      if (!alive.current) return;
      setStatus("error"); setError(toPdfProcessingError(caught, "A sanitized copy could not be created.").message); setMessage("");
    }
  }

  const highCount = inspection?.findings.filter(finding => finding.concern === "high").length ?? 0;
  const reviewCount = inspection?.findings.filter(finding => finding.concern === "review").length ?? 0;
  const infoCount = inspection?.findings.filter(finding => finding.concern === "informational").length ?? 0;
  const remainingInspectOnly = result ? groupPrivacyFindings(result.inspection).filter(group => !group.supported && group.findings.length) : [];
  const verified = result?.steps.every(step => step.status === "verified-removed") ?? false;

  return <section className="document-privacy-shell" aria-labelledby="document-privacy-title">
    <h2 className="sr-only" id="document-privacy-title">Inspect and sanitize PDF privacy traces</h2>
    <div className="privacy-banner"><span aria-hidden="true">✓</span><div><strong>Your PDF stays in this browser.</strong><p>Inspection and supported cleanup happen locally. No document is uploaded to ToolNest or a paid service.</p></div></div>
    <PdfUploader inputRef={inputRef} busy={busy} compact={Boolean(source)} multiple={false} inputId="document-privacy-file"
      heading="Drop one PDF to inspect" compactHeading="Replace PDF" buttonLabel={source ? "Choose another" : "Choose PDF"}
      helperText={`One PDF · ${formatPdfBytes(PRIVACY_LIMITS.fileBytes)} maximum · up to ${PRIVACY_LIMITS.pages} pages`} onSelect={choosePdf} />

    {source && <Card className="privacy-source-card">
      <div className="pdf-source-summary"><span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span><span className="pdf-file-details"><strong title={source.name}>{source.name}</strong><small>{formatPdfBytes(source.size)} · source remains unchanged</small></span><Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Replace</Button></div>
      {!inspection && <><div className="pdf-safety-note"><strong>Read-only first step</strong><span>ToolNest inventories privacy-relevant structures before offering only the removals this version can verify.</span></div><div className="pdf-split-actions"><Button size="lg" disabled={busy} onClick={() => void inspect()}>{status === "inspecting" ? "Inspecting PDF…" : "Inspect PDF"}</Button><Button variant="ghost" disabled={busy} onClick={reset}>Reset</Button></div></>}
    </Card>}

    {inspection && <div className="privacy-results">
      <Card className="privacy-summary-card">
        <div><span className="kicker">Inspection summary</span><h3>{inspection.findings.length ? `${inspection.findings.length} item${inspection.findings.length === 1 ? "" : "s"} to review` : "No reportable traces found"}</h3><p>{inspection.pageCount} page{inspection.pageCount === 1 ? "" : "s"} · {inspection.limits.objects.toLocaleString()} PDF objects inspected</p></div>
        <div className="privacy-counts" aria-label="Finding levels"><span className="is-high"><strong>{highCount}</strong> important</span><span className="is-review"><strong>{reviewCount}</strong> review</span><span><strong>{infoCount}</strong> information</span></div>
      </Card>

      {inspection.signed && <div className="privacy-signature-warning" role="alert"><strong>Digital signature warning</strong><p>Creating a sanitized copy rewrites the PDF and invalidates existing digital signatures. Keep the original if signature validity matters.</p></div>}

      <div className="privacy-workspace-heading"><div><span className="kicker">Choose what to remove</span><h3>Verified cleanup where supported</h3></div><Button variant="secondary" onClick={selectQuickClean} disabled={busy || status === "complete"}>Select Quick Clean</Button></div>
      <p className="privacy-quick-note">Quick Clean selects metadata, embedded files, and dangerous JavaScript or Launch actions. It never selects comments or inspection-only findings.</p>

      <div className="privacy-category-grid">{groups.map(group => {
        const key = group.key as keyof PrivacySelection;
        const selected = supportedKeys.has(group.key) ? selection[key] : false;
        return <Card key={group.key} className={`privacy-category-card${group.supported ? " is-supported" : " is-inspect-only"}${selected ? " is-selected" : ""}`}>
          <div className="privacy-category-head"><div><h4>{group.title}</h4><p>{group.description}</p></div><span className={group.findings.length ? "has-findings" : ""}>{group.findings.length}</span></div>
          {group.supported ? <label className="privacy-remove-choice"><input type="checkbox" checked={selected} disabled={!group.findings.length || busy || status === "complete"} onChange={event => toggle(key, event.target.checked)} /><span><strong>{group.findings.length ? "Remove from sanitized copy" : "Nothing detected"}</strong><small>{group.key === "comments" ? "Optional and potentially destructive" : "Verified after the new copy is saved"}</small></span></label> : <p className="privacy-inspect-only">Inspection only · no removal control</p>}
          {group.findings.length > 0 && <details className="privacy-finding-details"><summary>Review {group.findings.length} finding{group.findings.length === 1 ? "" : "s"}</summary><ul>{group.findings.map(finding => <li key={finding.id}><div><strong>{finding.title}</strong><span className={`privacy-concern is-${finding.concern}`}>{concernLabel(finding)}</span></div><p>{finding.description} {finding.rationale}</p>{finding.page && <small>Page {finding.page}</small>}{evidenceText(finding) && <small>{evidenceText(finding)}</small>}<details><summary>Technical details</summary><p>{finding.objectPath ? `Object path: ${finding.objectPath}. ` : ""}{finding.verificationMethod ?? "Reported for manual review."}{finding.technicalNotes ? ` ${finding.technicalNotes}` : ""}</p></details></li>)}</ul></details>}
        </Card>;
      })}</div>

      {selection.comments && <label className="privacy-comment-warning"><input type="checkbox" checked={commentAcknowledged} onChange={event => setCommentAcknowledged(event.target.checked)} disabled={busy || status === "complete"} /><span><strong>Comments and review markup may be visible on the pages. Removing them can change how the PDF looks.</strong><small>I understand this is destructive. Notes, highlights, ink, stamps, replies, authors, dates, and appearance streams selected as review annotations will be removed. Ordinary links, forms, file attachments, and unsupported proprietary annotations are preserved.</small></span></label>}

      {!result && <div className="privacy-action-bar"><div><strong>{chosen ? `${chosen} cleanup categor${chosen === 1 ? "y" : "ies"} selected` : "Choose a supported cleanup category"}</strong><small>A new file is created; the original is never overwritten.</small></div><Button size="lg" disabled={busy || !chosen || (selection.comments && !commentAcknowledged)} onClick={() => void sanitize()}>{status === "sanitizing" ? "Creating and verifying…" : "Sanitize Selected"}</Button><Button variant="ghost" disabled={busy} onClick={reset}>Start over</Button></div>}
    </div>}

    {result && download.download && <Card className={`privacy-verification-card${verified ? " is-verified" : " has-failure"}`} role="status">
      <div className="privacy-verification-head"><span aria-hidden="true">{verified ? "✓" : "!"}</span><div><strong>{verified ? "Selected removals verified" : "Verification needs attention"}</strong><p>{verified ? "The sanitized copy was parsed and reinspected after every selected cleanup." : "The copy was created, but ToolNest will not describe every selected removal as successful."}</p></div></div>
      <ul>{result.steps.map(step => <li key={step.key}><span>{step.title}<small>Before: {step.beforeCount} · After: {step.afterCount}</small></span><strong className={`is-${step.status}`}>{step.status === "verified-removed" ? "Verified removed" : step.status === "removal-failed" ? "Removal failed" : "Could not verify"}</strong>{step.warnings.map(warning => <small key={warning}>{warning}</small>)}</li>)}</ul>
      {remainingInspectOnly.length > 0 && <div className="privacy-remaining"><strong>Still requires manual review</strong><p>{remainingInspectOnly.map(group => `${group.title} (${group.findings.length})`).join(" · ")}</p></div>}
      <div className="privacy-download-row"><a className={buttonClassName()} href={download.download.url} download={download.download.filename}>Download sanitized PDF</a><Button variant="secondary" onClick={reset}>Inspect another PDF</Button></div>
    </Card>}

    <div className="pdf-status" aria-live="polite" aria-atomic="true">{message && <p>{message}</p>}{error && <p className="converter-error" role="alert"><strong>Couldn&apos;t finish this step.</strong> {error}</p>}</div>
    <details className="privacy-coverage"><summary>What ToolNest checked</summary><div><p><strong>Supported inspection:</strong> document structures, pages, text evidence, metadata, attachments, actions, annotations, forms, links, layers, thumbnails, and limited image signals.</p><p><strong>Verified sanitization:</strong> metadata/XMP, embedded files, JavaScript/Launch actions, and selected review comments.</p><p><strong>Inspection only:</strong> forms, links, hidden text, possible fake redactions, optional layers, thumbnails, and image-level metadata signals.</p><p><strong>Known limits:</strong> this is not a forensic certificate. Encrypted, proprietary, ambiguous, and complex graphic structures may not be fully supported.</p></div></details>
  </section>;
}
