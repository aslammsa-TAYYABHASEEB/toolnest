require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict');
const Module=require('node:module'),path=require('node:path'),canvas=require('@napi-rs/canvas');
const {PDFDict,PDFDocument,PDFName,PDFRef,PDFString,StandardFonts}=require('pdf-lib');
const {pathToFileURL}=require('node:url');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
Promise.try??=(callback,...args)=>Promise.resolve().then(()=>callback(...args));
const {inspectPdfPrivacy}=require('../lib/pdf/privacy-inspect.ts');
const {sanitizePdfActiveActions,sanitizePdfAttachments,sanitizePdfExternalLinks,sanitizePdfMetadata,sanitizePdfReviewAnnotations}=require('../lib/pdf/privacy-sanitize.ts');
const {groupPrivacyFindings,runPrivacySanitization}=require('../lib/pdf/privacy-workflow.ts');
const N=value=>PDFName.of(value),VISIBLE_TEXT='TRANSPARENT PREFLIGHT SEARCHABLE TEXT',FIELD_NAME='ApprovalCode',FIELD_VALUE='FORM VALUE 007-UNCHANGED',AUTHOR='Preflight Fixture Author',URI='https://example.test/preserved-link';

function resolveDict(pdf,value){const resolved=value instanceof PDFRef?pdf.context.lookup(value):value;return resolved instanceof PDFDict?resolved:undefined}
async function makeFixture(){
  const pdf=await PDFDocument.create({updateMetadata:false}),page=pdf.addPage([480,320]),font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(VISIBLE_TEXT,{x:42,y:260,size:17,font});
  const field=pdf.getForm().createTextField(FIELD_NAME);field.setText(FIELD_VALUE);field.addToPage(page,{x:42,y:175,width:210,height:28,font});
  pdf.setAuthor(AUTHOR);
  const xmp=pdf.context.stream('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description><tn:identity xmlns:tn="https://toolnesting.com/ns/">Preflight XMP Identity</tn:identity></rdf:Description></rdf:RDF></x:xmpmeta>',{Type:'Metadata',Subtype:'XML'});
  pdf.catalog.set(N('Metadata'),pdf.context.register(xmp));
  pdf.catalog.set(N('OpenAction'),pdf.context.register(pdf.context.obj({Type:'Action',S:'JavaScript',JS:PDFString.of('app.alert("preflight fixture")')})));
  const action=pdf.context.obj({Type:'Action',S:'URI',URI:PDFString.of(URI)}),link=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[42,100,252,128],Border:[0,0,0],A:action}));
  page.node.addAnnot(link);
  const bytes=new Uint8Array(await pdf.save({useObjectStreams:false,updateFieldAppearances:false}));
  return new File([bytes],'transparent-preflight-fixture.pdf',{type:'application/pdf'});
}
async function searchableText(pdfjs,blob){
  const document=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
  try{const pages=[];for(let index=1;index<=document.numPages;index++){const page=await document.getPage(index),content=await page.getTextContent();pages.push(content.items.map(item=>item.str).join(' '))}return{pageCount:document.numPages,text:pages.join('\n')}}finally{await document.loadingTask.destroy()}
}
function findPreservedUri(pdf){
  const annotations=pdf.getPage(0).node.Annots();if(!annotations)return;
  for(let index=0;index<annotations.size();index++){const annotation=resolveDict(pdf,annotations.get(index));if(!annotation||annotation.lookup(N('Subtype'))?.asString()!=='/Link')continue;const action=resolveDict(pdf,annotation.get(N('A')));if(action?.lookup(N('S'))?.asString()==='/URI')return action.lookup(N('URI'))?.decodeText()}
}
function counts(inspection){const groups=groupPrivacyFindings(inspection),count=key=>groups.find(group=>group.key===key)?.findings.length??0;return{metadata:count('metadata'),activeContent:count('activeContent'),forms:count('forms'),externalLinks:count('externalLinks')}}

(async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const openRenderer=async file=>pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
  const operations={metadata:file=>sanitizePdfMetadata(file,openRenderer),attachments:file=>sanitizePdfAttachments(file,openRenderer),activeContent:file=>sanitizePdfActiveActions(file,openRenderer),comments:file=>sanitizePdfReviewAnnotations(file,openRenderer),externalLinks:file=>sanitizePdfExternalLinks(file,openRenderer),inspect:file=>inspectPdfPrivacy(file,openRenderer)};
  const source=await makeFixture(),sourceSnapshot=new Uint8Array(await source.arrayBuffer()),before=await inspectPdfPrivacy(source,openRenderer),beforeText=await searchableText(pdfjs,source),beforePdf=await PDFDocument.load(sourceSnapshot,{updateMetadata:false}),beforeCounts=counts(before);
  assert.ok(beforeCounts.metadata>=2,'author metadata and document XMP must be detected');
  assert.ok(before.findings.some(f=>f.category==='metadata'&&f.evidence?.value===AUTHOR));assert.ok(before.findings.some(f=>f.category==='xmp'));
  assert.ok(beforeCounts.activeContent>0,'JavaScript action must be detected');assert.ok(beforeCounts.forms>0,'AcroForm must be detected');assert.equal(beforePdf.getForm().getTextField(FIELD_NAME).getText(),FIELD_VALUE);
  assert.ok(beforeCounts.externalLinks>0,'external URI must be detected');assert.equal(findPreservedUri(beforePdf),URI);assert.ok(beforeText.text.includes(VISIBLE_TEXT),'visible text must be searchable');assert.equal(beforeText.pageCount,before.pageCount);
  const result=await runPrivacySanitization(source,{metadata:true,attachments:false,activeContent:true,comments:false,externalLinks:false},undefined,operations);
  assert.ok(result.blob instanceof Blob,'workflow must return an in-memory Blob');assert.equal(result.blob.type,'application/pdf');assert.ok(result.blob.size>0);
  assert.deepEqual(new Uint8Array(await source.arrayBuffer()),sourceSnapshot,'source File must remain unchanged');
  assert.deepEqual(result.steps.map(step=>[step.key,step.status]),[['metadata','verified-removed'],['activeContent','verified-removed']]);
  const outputFile=new File([result.blob],result.filename,{type:'application/pdf'}),after=await inspectPdfPrivacy(outputFile,openRenderer),afterCounts=counts(after),outputBytes=new Uint8Array(await result.blob.arrayBuffer()),outputPdf=await PDFDocument.load(outputBytes,{updateMetadata:false}),afterText=await searchableText(pdfjs,result.blob);
  assert.equal(afterCounts.metadata,0,'metadata/XMP must be absent');assert.equal(afterCounts.activeContent,0,'JavaScript/dangerous actions must be absent');
  assert.ok(afterCounts.forms>0,'AcroForm must remain detected');assert.equal(outputPdf.getForm().getTextField(FIELD_NAME).getText(),FIELD_VALUE);
  assert.ok(afterCounts.externalLinks>0,'external URI must remain detected');assert.equal(findPreservedUri(outputPdf),URI);
  assert.ok(afterText.text.includes(VISIBLE_TEXT),'visible text must remain searchable');assert.equal(after.pageCount,before.pageCount,'page count must remain unchanged');assert.equal(afterText.pageCount,beforeText.pageCount,'output must parse with the same page count');
  assert.equal(result.inspection.pageCount,after.pageCount,'workflow inspection must describe actual output');assert.deepEqual(counts(result.inspection),afterCounts,'independent output reinspection must match workflow evidence');
  console.log('BEFORE',JSON.stringify({pageCount:before.pageCount,...beforeCounts,formValue:FIELD_VALUE,uri:URI,searchableText:true}));
  console.log('SELECTED',JSON.stringify({metadata:true,activeContent:true}));
  console.log('AFTER',JSON.stringify({pageCount:after.pageCount,...afterCounts,formValue:outputPdf.getForm().getTextField(FIELD_NAME).getText(),uri:findPreservedUri(outputPdf),searchableText:true,parseable:true}));
  console.log('PASS: in-memory inspect -> selected sanitization -> actual output reinspection');
})().catch(error=>{console.error(error);process.exitCode=1});
