"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BatchDocumentEvidence } from "@/components/batch-document-evidence";
import { parseCsvSource, parseCsvTable } from "@/lib/batch-verification/csv-source";
import { BATCH_COPY, batchComparisonValue, batchSourceOutcome, createBatchRunGate, runBatchVerification, validateBatchSetup, type BatchRun } from "@/lib/batch-verification/workflow";
import { BATCH_LIMITS, type FieldRule } from "@/lib/batch-verification/types";

export function MailMergeVerifier() {
  const gate = useRef(createBatchRunGate());
  const [bytes,setBytes] = useState<Uint8Array | null>(null),[csvName,setCsvName]=useState("");
  const [key,setKey]=useState(0),[keyAnchor,setKeyAnchor]=useState("");
  const [fields,setFields]=useState<FieldRule[]>([]),[pdf,setPdf]=useState<File|null>(null);
  const [run,setRun]=useState<BatchRun|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [row,setRow]=useState<number|null>(null),[page,setPage]=useState<number|null>(null),[column,setColumn]=useState<number|null>(null),[epoch,setEpoch]=useState(0);
  useEffect(()=>()=>gate.current.invalidate(),[]);
  const table=useMemo(()=>bytes?parseCsvTable(bytes):null,[bytes]);
  const setup=useMemo(()=>{if(!bytes)return {source:null,error:"Choose a source CSV."};try{const source=parseCsvSource(bytes,key);validateBatchSetup(source,{keyAnchor,fields});return {source,error:""};}catch(e){return {source:null,error:e instanceof Error?e.message:"Invalid setup."};}},[bytes,key,keyAnchor,fields]);
  function invalidate(){gate.current.invalidate();setRun(null);setRow(null);setPage(null);setColumn(null);setError("");setMessage("");setBusy(false)}
  function reset(){invalidate();setBytes(null);setCsvName("");setPdf(null);setFields([]);setKey(0);setKeyAnchor("");setEpoch(n=>n+1)}
  async function chooseCsv(file?:File){invalidate();setBytes(null);setPdf(null);setFields([]);setKey(0);setKeyAnchor("");if(!file)return;
    const job=gate.current.begin();setBusy(true);
    try{if(file.size>BATCH_LIMITS.csvBytes)throw new Error("CSV exceeds the 1 MiB limit.");const data=new Uint8Array(await file.arrayBuffer());const parsed=parseCsvTable(data);
      if(job.current()){setBytes(data);setCsvName(file.name);setKeyAnchor(parsed.headers[0]+":");}}
    catch(e){if(job.current())setError(e instanceof Error?e.message:"CSV could not be read.")}
    finally{if(job.current())setBusy(false)}
  }
  function updateField(selected:number,patch:Partial<FieldRule>){invalidate();setFields(old=>old.map(field=>field.column===selected?{...field,...patch}:field))}
  async function check(){if(!bytes||!pdf)return;invalidate();const job=gate.current.begin();setBusy(true);setMessage("Inspecting PDF and extracting native text…");
    try{const next=await runBatchVerification(bytes,key,pdf,{keyAnchor,fields},{signal:job.signal,onPage:n=>{if(job.current())setMessage(`Reading page ${n}; then checking visibility signals…`)}});
      if(job.current()){setRun(next);setRow(next.source.rows[0].physicalRow);setPage(next.result.rows[0].pages[0]??null);setColumn(fields[0].column);setMessage("");}}
    catch(e){if(job.current())setError(e instanceof Error?e.message:"Verification failed.")}
    finally{if(job.current())setBusy(false)}
  }
  const selectedSource=run?.source.rows.find(source=>source.physicalRow===row);
  const selectedPage=run?.result.pages.find(output=>output.page===page);
  const selectedField=selectedPage?.fields.find(field=>field.column===column);
  const selectedRule=run?.configuration.fields.find(field=>field.column===column);
  const summary=run?.result.summary;
  return <div className="batch-shell">
    <Card className="batch-panel"><h2>Before you begin</h2><p>Designed for one-record-per-page searchable/native-text PDFs with explicitly labelled, single-line fields. This tool checks generated output; it does not generate documents.</p><p>{BATCH_COPY.disclosure}</p><small>Files are processed in your browser; neither file is uploaded. CSV: 1 MiB, 50 columns, 200 records. PDF: 25 MiB, 200 pages. Up to 10 fields. No OCR or XLSX.</small></Card>
    <Card className="batch-panel"><h2>1. Source CSV</h2><label className="input-field">Source CSV<input key={`csv-${epoch}`} id="batch-csv" type="file" accept=".csv,text/csv" onChange={e=>void chooseCsv(e.target.files?.[0])}/></label>
      {table&&<p>{csvName} · {table.rows.length} records · {table.headers.join(", ")}</p>}
    </Card>
    {table&&<Card className="batch-panel"><h2>2. Verification setup</h2><div className="batch-settings">
      <label>Unique key column<select id="batch-key-column" value={key} onChange={e=>{invalidate();const n=Number(e.target.value);setKey(n);setKeyAnchor(table.headers[n]+":");setFields(old=>old.filter(f=>f.column!==n))}}>{table.headers.map((header,i)=><option key={i} value={i}>{header}</option>)}</select></label>
      <label>Record key label<input id="batch-key-anchor" value={keyAnchor} onChange={e=>{invalidate();setKeyAnchor(e.target.value)}}/></label>
    </div><p>Labels must end in a colon and appear at the start of a single coherent text line. Keys remain case-sensitive text; leading zeros are significant.</p>
      {table.headers.map((header,i)=>i===key?null:<fieldset key={i} className="batch-field"><legend><label><input id={`batch-select-${i}`} type="checkbox" checked={fields.some(f=>f.column===i)} onChange={e=>{invalidate();setFields(old=>e.target.checked?[...old,{column:i,anchor:header+":",mode:"exact"}]:old.filter(f=>f.column!==i))}}/> {header}</label></legend>
        {fields.filter(f=>f.column===i).map(field=><div className="batch-settings" key={i}>
          <label>Field label<input id={`batch-anchor-${i}`} value={field.anchor} onChange={e=>updateField(i,{anchor:e.target.value})}/></label>
          <label>Comparison<select id={`batch-mode-${i}`} value={field.mode} onChange={e=>updateField(i,{mode:e.target.value as FieldRule["mode"],number:{decimal:".",grouping:",",maxFractionDigits:2}})}><option value="exact">Exact text</option><option value="number">Numeric / Currency</option></select></label>
          {field.mode==="number"&&field.number&&<>
            <label>Currency symbol (optional)<input id={`batch-currency-${i}`} value={field.number.currency??""} maxLength={3} onChange={e=>updateField(i,{number:{...field.number!,currency:e.target.value||undefined}})}/></label>
            <label>Decimal separator<select id={`batch-decimal-${i}`} value={field.number.decimal} onChange={e=>updateField(i,{number:{...field.number!,decimal:e.target.value as "."|","}})}><option value=".">Period</option><option value=",">Comma</option></select></label>
            <label>Grouping separator<select id={`batch-grouping-${i}`} value={field.number.grouping} onChange={e=>updateField(i,{number:{...field.number!,grouping:e.target.value as "."|","|""}})}><option value=",">Comma</option><option value=".">Period</option><option value="">None</option></select></label>
            <label>Maximum decimal places<select id={`batch-precision-${i}`} value={field.number.maxFractionDigits} onChange={e=>updateField(i,{number:{...field.number!,maxFractionDigits:Number(e.target.value)}})}>{[0,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          </>}
        </div>)}
      </fieldset>)}
      {setup.error&&<p className="batch-setup-error" role="status">{setup.error}</p>}
    </Card>}
    {table&&<Card className="batch-panel"><h2>3. Generated PDF</h2><label className="input-field">Generated searchable PDF<input key={`pdf-${epoch}`} id="batch-pdf" type="file" accept=".pdf,application/pdf" onChange={e=>{invalidate();setPdf(e.target.files?.[0]??null)}}/></label>{pdf&&<p>{pdf.name}</p>}
      <div className="batch-actions"><Button disabled={busy||!pdf||!setup.source} onClick={()=>void check()}>Check batch</Button>{busy&&<Button variant="secondary" onClick={()=>{invalidate();setMessage("Cancelled. No verification result was published.")}}>Cancel</Button>}<Button variant="secondary" onClick={reset}>Reset</Button></div>
    </Card>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
    {run&&summary&&<section className="batch-results" aria-label="Batch results"><h2>4. Results</h2>
      <p>{`Selected fields in ${summary.passedSourceRecords} of ${summary.sourceRecordCount} source records matched the generated PDF under the configured checks.`}</p><p>{BATCH_COPY.pass} applies only to records marked PASS. Review all other outcomes.</p>
      <dl className="batch-summary">{[["Source records",summary.sourceRecordCount],["Passed",summary.passedSourceRecords],["Needs review / failed",summary.failedOrReviewSourceRecords],["Missing output",summary.missingSourceRecords],["Output pages",summary.outputPageCount],["Assigned pages",summary.assignedOutputPages],["Duplicate output instances",summary.duplicateOutputInstances],["Unresolved pages",summary.unresolvedOutputPages],["Ambiguous pages",summary.ambiguousPages],["Blank pages",summary.blankPages]].map(([label,value])=><div key={label}><dt>{label}</dt><dd data-summary={label}>{value}</dd></div>)}</dl>
      <small>Assigned + unresolved + ambiguous pages = output pages. Duplicate instances and blank pages are additional counts, not extra pages.</small>
      <div className="batch-result-navigation"><div><h3>Source records</h3>{run.source.rows.map(source=><button key={source.physicalRow} className={row===source.physicalRow?"is-current":""} onClick={()=>{setRow(source.physicalRow);const outcome=run.result.rows.find(r=>r.physicalRow===source.physicalRow);setPage(outcome?.pages[0]??run.result.pages.find(p=>p.candidates.includes(source.normalizedKey))?.page??null)}}>CSV row {source.physicalRow} · {source.key} · {batchSourceOutcome(run,source.normalizedKey)}</button>)}</div>
        <div><h3>Output pages</h3>{run.result.pages.map(output=><button key={output.page} className={page===output.page?"is-current":""} onClick={()=>{setPage(output.page);setRow(run.source.rows.find(s=>s.normalizedKey===output.key)?.physicalRow??null)}}>Page {output.page} · {output.blank?"BLANK PAGE":output.key&&run.result.rows.find(r=>r.pages.includes(output.page))?.status==="DUPLICATE OUTPUT RECORD"?"DUPLICATE OUTPUT RECORD":output.status}</button>)}</div>
      </div>
      <div className="batch-evidence-layout"><Card className="batch-panel"><h3>Source CSV evidence</h3>{selectedSource?<><p>Original physical row {selectedSource.physicalRow}</p><dl>{run.source.headers.map((header,i)=><div key={i}><dt>{header}</dt><dd>{selectedSource.cells[i]}</dd></div>)}</dl></>:<p>No defensible source row is assigned to this output page.</p>}
        {selectedPage&&<><h3>Selected field</h3><select aria-label="Evidence field" value={column??""} onChange={e=>setColumn(Number(e.target.value))}>{run.configuration.fields.map(field=><option key={field.column} value={field.column}>{run.source.headers[field.column]}</option>)}</select>
          {selectedField&&<><p>Finding: {selectedPage.status==="UNSUPPORTED VISIBILITY / REVIEW"?"VISIBILITY REVIEW (field comparisons cannot PASS this record)":selectedField.status}</p><p>Expected raw source: <strong>{selectedField.expected}</strong></p><p>Observed PDF value: <strong>{selectedField.observed.join(" | ")||"No anchored value"}</strong></p>
            <p>Rule: {selectedRule?.mode==="exact"?"Exact text · Unicode NFC and outer whitespace trimming only":`Numeric / Currency · symbol ${selectedRule?.number?.currency||"none"} · grouping ${selectedRule?.number?.grouping||"none"} · decimal ${selectedRule?.number?.decimal} · maximum ${selectedRule?.number?.maxFractionDigits} decimal places · exact scaled-integer comparison`}</p>
            {selectedRule&&<p>Comparison values (not source evidence): expected {batchComparisonValue(selectedField.expected,selectedRule)}; observed {selectedField.observed.map(value=>batchComparisonValue(value,selectedRule)).join(" | ")||"none"}</p>}<small>Raw values are shown above; comparison normalization does not change source evidence.</small>
          </>}
        </>}
      </Card><BatchDocumentEvidence file={run.file} page={page} keyEvidence={selectedPage?.keyEvidence??[]} fieldEvidence={selectedField?.evidence??[]}/></div>
      <details><summary>Scope and inspection limitations</summary>{run.result.limitations.map((text,i)=><p key={i}>{text}</p>)}</details>
    </section>}
  </div>;
}
