"use client";

import { useMemo, useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toPdfProcessingError } from "@/lib/pdf/errors";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { MAX_PDF_TOTAL_SIZE } from "@/lib/pdf/types";
import { formatPdfBytes } from "@/lib/pdf/validation";
import { inspectPdfPreflight } from "@/lib/preflight/inspect";
import { buildPreflightPlan } from "@/lib/preflight/plan";
import { runApprovedPreflight } from "@/lib/preflight/run";
import type { PreflightApproval, PreflightInspection, PreflightRequirements, PreflightRunResult, RequiredPageSize } from "@/lib/preflight/types";

type Status = "idle" | "ready" | "inspecting" | "review" | "processing" | "complete" | "error";
const emptyApproval: PreflightApproval = {
  removeActiveActions: false, removeMetadata: false, removeAttachments: false,
  removeExternalLinks: false, removeComments: false, tryStructureOptimization: false,
};
const stateLabel = {
  pass: "Pass", fail: "Does not meet requirement", "can-fix": "Can fix after approval",
  "needs-decision": "Needs your decision", "not-checked": "Not checked",
};

function safetyCount(inspection: PreflightInspection, key: string) {
  return inspection.safety.find(item => item.key === key)?.count ?? 0;
}
function changeStatus(status: PreflightRunResult["steps"][number]["status"]) {
  if (status === "verified-removed") return "Verified removed";
  if (status === "removal-failed") return "Removal failed";
  if (status === "could-not-verify") return "Could not verify";
  if (status === "no-savings") return "No useful savings";
  return "Applied";
}

export function PdfPreflight() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [maximumSize, setMaximumSize] = useState("");
  const [maximumPages, setMaximumPages] = useState("");
  const [pageSize, setPageSize] = useState<RequiredPageSize>("any");
  const [disallowActiveActions, setDisallowActiveActions] = useState(true);
  const [source, setSource] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [inspection, setInspection] = useState<PreflightInspection | null>(null);
  const [approval, setApproval] = useState<PreflightApproval>(emptyApproval);
  const [result, setResult] = useState<PreflightRunResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const download = usePdfDownload();
  const busy = status === "inspecting" || status === "processing";
  const requirements: PreflightRequirements = useMemo(() => ({
    maximumSizeMb: maximumSize ? Number(maximumSize) : undefined,
    maximumPages: maximumPages ? Number(maximumPages) : undefined,
    requiredPageSize: pageSize,
    disallowActiveActions,
  }), [maximumSize, maximumPages, pageSize, disallowActiveActions]);
  const plan = inspection ? buildPreflightPlan(inspection) : null;
  const selectedCount = Object.values(approval).filter(Boolean).length;

  function resetOutput() {
    download.clear(); setInspection(null); setApproval(emptyApproval); setResult(null); setMessage(""); setError("");
  }
  function selectPdf(files: File[]) {
    const file = files[0]; if (!file || busy) return;
    resetOutput();
    if ((!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") || file.size > MAX_PDF_TOTAL_SIZE) {
      setSource(null); setStatus("error"); setError("Choose one PDF no larger than " + formatPdfBytes(MAX_PDF_TOTAL_SIZE) + "."); return;
    }
    setSource(file); setStatus("ready");
    if (inputRef.current) inputRef.current.value = "";
  }
  function reset() {
    resetOutput(); setSource(null); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }
  function editRequirements() {
    download.clear(); setInspection(null); setApproval(emptyApproval); setResult(null); setStatus(source ? "ready" : "idle"); setMessage("Requirements unlocked. Run the preflight again after editing.");
  }
  async function inspect() {
    if (!source || busy || (maximumSize && Number(maximumSize) <= 0) || (maximumPages && Number(maximumPages) <= 0)) return;
    resetOutput(); setStatus("inspecting"); setMessage("Checking requirements and privacy-relevant PDF structures...");
    try {
      const next = await inspectPdfPreflight(source, requirements);
      setInspection(next);
      setApproval({
        ...emptyApproval,
        removeActiveActions: next.checks.some(check => check.key === "active-actions" && check.state === "can-fix"),
        tryStructureOptimization: next.checks.some(check => check.key === "file-size" && check.state === "can-fix"),
      });
      setStatus("review"); setMessage("Before inspection complete. Review the evidence and approve only the changes you want.");
    } catch (caught) {
      setStatus("error"); setError(toPdfProcessingError(caught, "This PDF could not be inspected.").message); setMessage("");
    }
  }
  function toggle(key: keyof PreflightApproval, checked: boolean) {
    download.clear(); setResult(null); setApproval(current => ({ ...current, [key]: checked }));
  }
  async function process() {
    if (!source || !inspection || busy || !selectedCount || inspection.signed !== false) return;
    download.clear(); setResult(null); setError(""); setStatus("processing"); setMessage("Applying approved changes, then reinspecting the actual output...");
    try {
      const next = await runApprovedPreflight(source, inspection, requirements, approval);
      setResult(next); setStatus("complete");
      if (next.changed) download.replace(next.blob, next.filename);
      setMessage(next.changed ? "Approved changes finished. The actual output was parsed and checked again." : "No useful change was adopted.");
    } catch (caught) {
      setStatus("error"); setError(toPdfProcessingError(caught, "The approved preflight changes could not be completed.").message); setMessage("");
    }
  }
  const optionalChoices = inspection ? [
    ["removeMetadata", "Remove metadata and XMP", "metadata", "Optional. Existing document metadata will otherwise remain."],
    ["removeAttachments", "Remove embedded files", "attachments", "Explicit approval required; attached files will no longer be available."],
    ["removeExternalLinks", "Remove external URI links", "external-links", "External links stop working; internal page links are preserved."],
    ["removeComments", "Remove comments and review marks", "comments", "May change visible review markup."],
  ] as const : [];

  return <section className="preflight-shell" aria-labelledby="preflight-workspace-title">
    <h2 className="sr-only" id="preflight-workspace-title">PDF Preflight workspace</h2>
    <Card className="preflight-requirements">
      <div className="preflight-section-head"><div><span className="kicker">1 - Requirements</span><h3>What must this PDF meet?</h3><p>Leave optional limits blank. No portal preset is assumed.</p></div>{inspection && <Button variant="ghost" size="sm" onClick={editRequirements} disabled={busy}>Edit requirements</Button>}</div>
      <fieldset disabled={busy || Boolean(inspection)}><div className="preflight-fields">
        <label><span>Maximum file size <small>Optional - MB</small></span><input type="number" min="0.01" step="0.01" value={maximumSize} onChange={event => setMaximumSize(event.target.value)} placeholder="Example: 10" /></label>
        <label><span>Maximum page count <small>Optional</small></span><input type="number" min="1" step="1" value={maximumPages} onChange={event => setMaximumPages(event.target.value)} placeholder="Example: 50" /></label>
        <label><span>Required page size</span><select value={pageSize} onChange={event => setPageSize(event.target.value as RequiredPageSize)}><option value="any">Any</option><option value="a4">A4</option><option value="letter">Letter</option></select></label>
      </div><label className="preflight-switch"><input type="checkbox" checked={disallowActiveActions} onChange={event => setDisallowActiveActions(event.target.checked)} /><span><strong>No JavaScript or dangerous active actions</strong><small>Enabled by default. Existing bounded privacy inspection is used.</small></span></label><p className="preflight-fixed-check">Always checked: no encryption or password protection.</p></fieldset>
    </Card>

    <div className="preflight-upload"><div className="preflight-section-head"><div><span className="kicker">2 - Your PDF</span><h3>Select once</h3><p>The same in-memory file continues through inspection, approved changes, and reinspection.</p></div></div>
      <PdfUploader inputRef={inputRef} busy={busy} compact={Boolean(source)} multiple={false} inputId="pdf-preflight-file" heading="Choose one PDF" compactHeading="Selected PDF" buttonLabel={source ? "Choose another" : "Choose PDF"} helperText={"One PDF - " + formatPdfBytes(MAX_PDF_TOTAL_SIZE) + " maximum"} onSelect={selectPdf} />
      {source && <Card className="preflight-source"><div className="pdf-source-summary"><span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span><span className="pdf-file-details"><strong title={source.name}>{source.name}</strong><small>{formatPdfBytes(source.size)} - source remains unchanged</small></span><Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Replace</Button></div>{!inspection && <div className="pdf-split-actions"><Button size="lg" onClick={() => void inspect()} disabled={busy || (maximumSize !== "" && Number(maximumSize) <= 0) || (maximumPages !== "" && Number(maximumPages) <= 0)}>{busy ? "Checking PDF..." : "Run preflight"}</Button><Button variant="ghost" onClick={reset} disabled={busy}>Reset</Button></div>}</Card>}
    </div>

    {inspection && plan && <div className="preflight-results">
      <div className="preflight-section-head"><div><span className="kicker">3 - Before inspection</span><h3>What the selected PDF shows</h3><p>Requirement checks and safety review are separate.</p></div></div>
      <div className="preflight-check-grid">{inspection.checks.map(check => <Card key={check.key} className={"preflight-check is-" + check.state}><div><strong>{check.label}</strong><span>{stateLabel[check.state]}</span></div><p>{check.summary}</p></Card>)}</div>
      {inspection.pageSizes.length > 0 && <details className="preflight-details"><summary>Page dimensions and rotations</summary><ul>{inspection.pageSizes.map(page => <li key={page.page}>Page {page.page}: {page.widthPoints.toFixed(1)} x {page.heightPoints.toFixed(1)} pt - {page.rotation} deg{page.matches ? "" : " - does not match requirement"}</li>)}</ul></details>}
      <Card className="preflight-safety"><div className="preflight-section-head"><div><span className="kicker">Safety review</span><h3>Observed document structures</h3></div></div><ul>{inspection.safety.map(item => <li key={item.key}><span><strong>{item.label}</strong><small>{item.summary}</small></span><b>{item.checked ? String(item.count ?? 0) : "Not checked"}</b></li>)}</ul></Card>
      {inspection.signed === true && <div className="preflight-warning" role="alert"><strong>Digital signature structure detected</strong><p>Rewriting can invalidate an existing signature. Automatic cleanup and compression are disabled. ToolNest does not claim that the signature is cryptographically valid.</p></div>}
      {inspection.signed === null && <div className="preflight-warning" role="alert"><strong>Rewrite safety not checked</strong><p>Rewrite safety could not be checked, so ToolNest will not modify this PDF automatically.</p></div>}

      <div className="preflight-section-head"><div><span className="kicker">4 - Plan</span><h3>Review before anything changes</h3></div></div>
      <div className="preflight-plan-grid">{([
        ["Passed", plan.passed], ["Automatic options", plan.canFix], ["Needs your decision", plan.needsDecision],
        ["Will not intentionally change", plan.willNotChange], ["Not checked", plan.notChecked],
      ] as const).map(([title, items]) => <Card key={title}><h4>{title}</h4>{items.length ? <ul>{items.map(item => <li key={item}>{item}</li>)}</ul> : <p>None</p>}</Card>)}</div>

      {inspection.signed === false && <Card className="preflight-approval"><span className="kicker">5 - Your approval</span><h3>Choose supported changes</h3>
        {inspection.checks.some(check => check.key === "active-actions" && check.state === "can-fix") && <label><input type="checkbox" checked={approval.removeActiveActions} onChange={event => toggle("removeActiveActions", event.target.checked)} /><span><strong>Remove JavaScript and dangerous active actions</strong><small>Required by your current settings. Existing sanitization will recheck the output.</small></span></label>}
        {optionalChoices.map(([key, label, safetyKey, description]) => {
          const count = safetyCount(inspection, safetyKey); return <label key={key} className={!count ? "is-disabled" : ""}><input type="checkbox" disabled={!count || busy} checked={approval[key]} onChange={event => toggle(key, event.target.checked)} /><span><strong>{label}</strong><small>{count ? description : "Nothing detected in this category."}</small></span></label>;
        })}
        {inspection.checks.some(check => check.key === "file-size" && check.state === "can-fix") && <label><input type="checkbox" checked={approval.tryStructureOptimization} onChange={event => toggle("tryStructureOptimization", event.target.checked)} /><span><strong>Try structure optimization</strong><small>Lossless first attempt only. Balanced and Strong compression will not run automatically.</small></span></label>}
        <div className="preflight-action-row"><Button size="lg" disabled={busy || !selectedCount} onClick={() => void process()}>{status === "processing" ? "Applying and checking..." : "Approve changes and create copy"}</Button><Button variant="ghost" disabled={busy} onClick={reset}>Start over</Button></div>
      </Card>}
    </div>}

    {result && <Card className="preflight-after">
      <div className="preflight-section-head"><div><span className="kicker">6 - After verification</span><h3>Actual output reinspection</h3><p>The output Blob was converted to an in-memory File and checked again.</p></div></div>
      <h4>Changed</h4><ul>{result.steps.filter(step => step.status !== "no-savings").map((step, index) => <li key={step.label + index}><strong>{step.label}</strong><span>{step.summary} - {changeStatus(step.status)}</span></li>)}{!result.steps.some(step => step.status !== "no-savings") && <li><strong>No change adopted</strong><span>The attempted output was not used.</span></li>}</ul>
      <h4>Preserved / observed after processing</h4><ul>{result.after.safety.filter(item => item.checked && ["forms", "external-links", "attachments", "comments", "hidden-text"].includes(item.key)).map(item => <li key={item.key}><strong>{item.label}</strong><span>{item.count ?? 0} observed after processing</span></li>)}</ul>
      <h4>Remaining failures</h4><ul>{result.after.checks.filter(check => check.state === "fail" || check.state === "can-fix").map(check => <li key={check.key}><strong>{check.label}</strong><span>{check.summary}</span></li>)}{!result.after.checks.some(check => check.state === "fail" || check.state === "can-fix") && <li><strong>None in the checked requirements</strong><span>Only the checks shown as completed are covered.</span></li>}</ul>
      <h4>Manual decisions remaining</h4><ul>{result.after.checks.filter(check => check.state === "needs-decision").map(check => <li key={check.key}><strong>{check.label}</strong><span>{check.summary}</span></li>)}{!result.after.checks.some(check => check.state === "needs-decision") && !result.furtherCompressionNeedsDecision && <li><strong>None identified</strong><span>Unchecked areas can still require separate review.</span></li>}</ul>
      {result.furtherCompressionNeedsDecision && <div className="preflight-warning"><strong>Further compression needs your decision</strong><p>Further compression would require a more destructive method and needs your decision. It was not run automatically.</p></div>}
      {result.after.safety.some(item => !item.checked) && <><h4>Not checked</h4><ul>{result.after.safety.filter(item => !item.checked).map(item => <li key={item.key}><strong>{item.label}</strong><span>{item.summary}</span></li>)}</ul></>}
      <div className="preflight-action-row">{result.changed && download.download && <a className={buttonClassName({ size: "lg" })} href={download.download.url} download={download.download.filename}>Download preflight copy</a>}<Button variant="secondary" onClick={reset}>Check another PDF</Button></div>
    </Card>}
    <div className="pdf-status" aria-live="polite" aria-atomic="true">{message && <p>{message}</p>}{error && <p className="converter-error" role="alert"><strong>Couldn&apos;t finish this step.</strong> {error}</p>}</div>
  </section>;
}
