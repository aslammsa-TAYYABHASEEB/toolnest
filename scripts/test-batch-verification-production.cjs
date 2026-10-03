// Production coordinator/configuration coverage using public synthetic data only.
require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const canvas=require('@napi-rs/canvas'),{pathToFileURL}=require('node:url');
const {PDFDocument,StandardFonts,rgb,setTextRenderingMode}=require('pdf-lib');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
Promise.try??=(fn,...args)=>Promise.resolve().then(()=>fn(...args));
const {parseCsvTable,parseCsvSource}=require('../lib/batch-verification/csv-source.ts');
const {BATCH_LIMITS}=require('../lib/batch-verification/types.ts');
const {BATCH_COPY,batchComparisonValue,validateBatchSetup,createBatchRunGate,runBatchVerification,batchSourceOutcome}=require('../lib/batch-verification/workflow.ts');
const bytes=new TextEncoder().encode('ID,Name,Salary\n0012,Ada,100\n0013,Ben,200\n');
const config={keyAnchor:'ID:',fields:[{column:1,anchor:'Name:',mode:'exact'},{column:2,anchor:'Salary:',mode:'number',number:{decimal:'.',grouping:',',maxFractionDigits:2}}]};
let open,pass=0;
async function check(name,fn){await fn();pass++;console.log('PASS:',name)}
async function fixture(records=[{id:'0012',name:'Ada',salary:'100'},{id:'0013',name:'Ben',salary:'200'}]){
 const pdf=await PDFDocument.create({updateMetadata:false}),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const record of records){const page=pdf.addPage([420,300]);if(record.blank)continue;
  if(record.imageOnly){const surface=canvas.createCanvas(200,120),ctx=surface.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,200,120);ctx.fillStyle='black';ctx.fillText('SCANNED PUBLIC TEXT',10,50);page.drawImage(await pdf.embedPng(surface.toBuffer('image/png')),{x:20,y:30,width:200,height:120});continue;}
  for(const [i,text] of [`ID: ${record.id}`,`Name: ${record.name??'Ada'}`,`Salary: ${record.salary??'100'}`,record.extra].filter(Boolean).entries())page.drawText(text,{x:30,y:260-i*35,font,size:12});
  if(record.hidden){page.pushOperators(setTextRenderingMode(3));page.drawText('HIDDEN',{x:30,y:60,font,size:12});}
 }
 return new File([await pdf.save({useObjectStreams:false})],'public-workflow.pdf',{type:'application/pdf'});
}
const run=async(records,cfg=config)=>runBatchVerification(bytes,0,await fixture(records),cfg,{},open);
(async()=>{
 const js=await import('pdfjs-dist/legacy/build/pdf.mjs');js.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
 const standardFontDataUrl=path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts').replaceAll('\\','/')+'/';
 open=async file=>js.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,enableScripting:false,standardFontDataUrl}).promise;
 const source=parseCsvSource(bytes,0);
 await check('Header preview does not require first column to be a usable key',()=>{const data=new TextEncoder().encode('Name,ID\n,0012\n,0013\n');assert.equal(parseCsvTable(data).rows.length,2);assert.throws(()=>parseCsvSource(data,0));assert.equal(parseCsvSource(data,1).rows[0].key,'0012')});
 await check('Explicit anchored key and one-to-ten fields required',()=>{validateBatchSetup(source,config);for(const bad of [{...config,keyAnchor:''},{...config,fields:[]},{...config,fields:Array(11).fill(config.fields[0])},{...config,fields:[{...config.fields[0],anchor:'Name'}]}])assert.throws(()=>validateBatchSetup(source,bad))});
 await check('Duplicate labels, columns and key-as-field fail closed',()=>{for(const fields of [[config.fields[0],config.fields[0]],[{...config.fields[0],anchor:'ID:'}],[{...config.fields[0],column:0}]])assert.throws(()=>validateBatchSetup(source,{...config,fields}))});
 await check('Invalid separators, precision and currency cannot run',()=>{for(const patch of [{grouping:'.'},{maxFractionDigits:1},{currency:'oops'}])assert.throws(()=>validateBatchSetup(source,{...config,fields:[{...config.fields[1],number:{...config.fields[1].number,...patch}}]}))});
 await check('Identifier heading cannot opt into numeric comparison',()=>{const src=parseCsvSource(new TextEncoder().encode('ID,Account number\nA,0012\n'),0);assert.throws(()=>validateBatchSetup(src,{keyAnchor:'ID:',fields:[{column:1,anchor:'Account:',mode:'number',number:config.fields[1].number}]}))});
 await check('Source numeric format must match explicit rule',()=>{const src=parseCsvSource(new TextEncoder().encode('ID,Salary\nA,0012\n'),0);assert.throws(()=>validateBatchSetup(src,{keyAnchor:'ID:',fields:[{column:1,anchor:'Salary:',mode:'number',number:config.fields[1].number}]}))});
 await check('Raw evidence and comparison display stay separate and exact',()=>{assert.equal(batchComparisonValue('$1,234.50',{...config.fields[1],number:{...config.fields[1].number,currency:'$'}}),'1234.50');assert.equal(batchComparisonValue('0012',config.fields[0]),'0012');assert.equal(batchComparisonValue('0012',config.fields[1]),'Not numeric under this rule');assert.equal(source.rows[0].cells[2],'100');assert.ok(Object.isFrozen(source.rows[0].cells))});
 await check('Production happy path reconciles source and output populations',async()=>{const result=await run();assert.equal(result.result.summary.passedSourceRecords,2);assert.equal(result.result.summary.outputPageCount,2);assert.equal(batchSourceOutcome(result,'0012'),'PASS');assert.ok(Object.isFrozen(result.configuration.fields[0]));assert.equal(result.source.rows[0].physicalRow,2)});
 await check('Field mismatch and missing record remain distinct',async()=>{const result=await run([{id:'0012',salary:'110'}]);assert.equal(batchSourceOutcome(result,'0012'),'FIELD MISMATCH');assert.equal(batchSourceOutcome(result,'0013'),'MISSING OUTPUT RECORD');assert.equal(result.result.summary.failedOrReviewSourceRecords,1);assert.equal(result.result.summary.missingSourceRecords,1)});
 await check('Repeated field anchor renders ambiguity rather than PASS',async()=>{const result=await run([{id:'0012',extra:'Salary: 100'}]);assert.equal(batchSourceOutcome(result,'0012'),'AMBIGUOUS FIELD')});
 await check('Multiple key candidates render ambiguous key',async()=>{const result=await run([{id:'0012',extra:'ID: 0013'}]);assert.equal(result.result.summary.ambiguousPages,1);assert.equal(batchSourceOutcome(result,'0012'),'AMBIGUOUS KEY')});
 await check('Leading zeros significant; unknown page is unresolved',async()=>{const result=await run([{id:'12'}]);assert.equal(result.result.summary.unresolvedOutputPages,1);assert.equal(result.result.summary.passedSourceRecords,0)});
 await check('Duplicate page instances counted without claiming source PASS',async()=>{const result=await run([{id:'0012'},{id:'0012'}]);assert.equal(result.result.summary.duplicateOutputInstances,1);assert.equal(batchSourceOutcome(result,'0012'),'DUPLICATE OUTPUT RECORD')});
 await check('Detected hidden text requires visibility review',async()=>{const result=await run([{id:'0012',hidden:true}]);assert.equal(batchSourceOutcome(result,'0012'),'VISIBILITY REVIEW');assert.equal(result.result.summary.passedSourceRecords,0)});
 await check('Image-only/non-searchable output rejected, never partial PASS',async()=>{await assert.rejects(run([{id:'0012'},{imageOnly:true}]),/searchable\/native-text PDF/)});
 await check('Blank page remains separately accounted rather than silently dropped',async()=>{const result=await run([{id:'0012'},{blank:true}]);assert.equal(result.result.summary.blankPages,1);assert.equal(result.result.summary.outputPageCount,2);assert.equal(result.result.summary.unresolvedOutputPages,1)});
 await check('CSV byte/record/column/cell limits and malformed grammar fail closed',()=>{for(const data of [new Uint8Array(BATCH_LIMITS.csvBytes+1),new TextEncoder().encode('ID,N\n'+Array.from({length:201},(_,i)=>`A${i},X`).join('\n')),new TextEncoder().encode(Array.from({length:51},(_,i)=>'C'+i).join(',')+'\n'+Array(51).fill('X').join(',')),new TextEncoder().encode('ID,N\nA,'+'X'.repeat(4097)),new TextEncoder().encode('ID,N\nA,"bad')])assert.throws(()=>parseCsvTable(data))});
 await check('PDF bytes/header limits checked before opening',async()=>{const cfg=config;await assert.rejects(runBatchVerification(bytes,0,new File([new Uint8Array(BATCH_LIMITS.pdfBytes+1)],'large.pdf',{type:'application/pdf'}),cfg,{},()=>{throw Error('must not open')}),/25 MiB/);await assert.rejects(runBatchVerification(bytes,0,new File(['wrong'],'bad.pdf',{type:'application/pdf'}),cfg,{},open),/PDF header/)});
 await check('Page limit rejects whole document and destroys loading task',async()=>{let destroyed=false;await assert.rejects(runBatchVerification(bytes,0,await fixture(),config,{},async()=>({numPages:201,loadingTask:{destroy:async()=>{destroyed=true}}})),/page limit/);assert.equal(destroyed,true)});
 await check('Replacement/reset/config change invalidate all previous run receipts',()=>{const gate=createBatchRunGate(),first=gate.begin();assert.equal(first.current(),true);const second=gate.begin();assert.equal(first.current(),false);assert.equal(first.signal.aborted,true);gate.invalidate();assert.equal(second.current(),false);assert.equal(second.signal.aborted,true)});
 await check('Cancellation between pages destroys document and never publishes result',async()=>{const controller=new AbortController();await assert.rejects(runBatchVerification(bytes,0,await fixture(),config,{signal:controller.signal,onPage:()=>controller.abort()},open),/cancelled/)});
 await check('Unavailable visibility inspection cannot yield source PASS',async()=>{let calls=0;const file=await fixture();const result=await runBatchVerification(bytes,0,file,config,{},async f=>{if(++calls>1)throw Error('inspection unavailable');return open(f)});assert.equal(result.result.summary.passedSourceRecords,0);assert.equal(batchSourceOutcome(result,'0012'),'VISIBILITY REVIEW')});
 await check('Conservative PASS/review/unsupported disclosures',()=>{assert.equal(BATCH_COPY.pass,'Supported extracted-text checks passed under the configured verification rules.');assert.equal(BATCH_COPY.disclosure,'PDF text extraction does not prove that every matching value is visibly rendered exactly as expected.');assert.match(BATCH_COPY.unsupported,/searchable\/native-text/)});
 console.log(`RESULT ${pass} PASS / 0 FAIL`);
})().catch(error=>{console.error(error);process.exitCode=1});
