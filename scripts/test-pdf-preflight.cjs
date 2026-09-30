require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
const Module=require('node:module'),path=require('node:path'),canvas=require('@napi-rs/canvas');
const {PDFDocument,PDFName,PDFString,StandardFonts}=require('pdf-lib');
const {pathToFileURL}=require('node:url');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
Promise.try??=(callback,...args)=>Promise.resolve().then(()=>callback(...args));
const {inspectPdfPrivacy}=require('../lib/pdf/privacy-inspect.ts');
const {sanitizePdfMetadata,sanitizePdfAttachments,sanitizePdfActiveActions,sanitizePdfReviewAnnotations,sanitizePdfExternalLinks}=require('../lib/pdf/privacy-sanitize.ts');
const {runPrivacySanitization}=require('../lib/pdf/privacy-workflow.ts');
const {inspectPdfPreflight}=require('../lib/preflight/inspect.ts');
const {buildPreflightPlan}=require('../lib/preflight/plan.ts');
const {runApprovedPreflight}=require('../lib/preflight/run.ts');
const N=value=>PDFName.of(value),FIELD='KeepField',VALUE='KEEP-FORM-EXACT',AUTHOR='KEEP AUTHOR',URI='https://example.test/keep';
let openRenderer,inspectWithRenderer,sanitizeWithRenderer;

async function fixture(options={}){
  const pdf=await PDFDocument.create({updateMetadata:false}),page=pdf.addPage(options.letter?[612,792]:[420,280]),font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PREFLIGHT SEARCHABLE CONTROL',{x:42,y:220,size:18,font});
  const field=pdf.getForm().createTextField(FIELD);field.setText(VALUE);field.addToPage(page,{x:42,y:150,width:180,height:24,font});
  pdf.setAuthor(AUTHOR);pdf.addJavaScript('Fixture','app.alert("fixture")');
  page.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[25,25,125,50],A:{Type:'Action',S:'URI',URI:PDFString.of(URI)}})));
  const bytes=new Uint8Array(await pdf.save({useObjectStreams:false,updateFieldAppearances:false}));
  return new File([bytes],options.name??'preflight.pdf',{type:'application/pdf'});
}
async function signedFixture(){
  const pdf=await PDFDocument.create({updateMetadata:false});pdf.addPage([320,220]);
  pdf.catalog.set(N('SignatureFixture'),pdf.context.register(pdf.context.obj({Type:'Sig',ByteRange:[0,0,0,0],Contents:PDFString.of('SYNTHETIC')})));
  const bytes=new Uint8Array(await pdf.save({useObjectStreams:false}));
  return new File([bytes],'signed.pdf',{type:'application/pdf'});
}
const requirements=overrides=>({requiredPageSize:'letter',disallowActiveActions:true,maximumPages:1,...overrides});
const approval=overrides=>({removeActiveActions:false,removeMetadata:false,removeAttachments:false,removeExternalLinks:false,removeComments:false,tryStructureOptimization:false,...overrides});

(async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  openRenderer=async file=>pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
  inspectWithRenderer=file=>inspectPdfPrivacy(file,openRenderer);
  const operations={metadata:file=>sanitizePdfMetadata(file,openRenderer),attachments:file=>sanitizePdfAttachments(file,openRenderer),activeContent:file=>sanitizePdfActiveActions(file,openRenderer),comments:file=>sanitizePdfReviewAnnotations(file,openRenderer),externalLinks:file=>sanitizePdfExternalLinks(file,openRenderer),inspect:inspectWithRenderer};
  sanitizeWithRenderer=(file,selection,onStage)=>runPrivacySanitization(file,selection,onStage,operations);
  const inspect=(file,rules)=>inspectPdfPreflight(file,rules,{inspectPrivacy:inspectWithRenderer});

  const source=await fixture(),before=await inspect(source,requirements({maximumSizeMb:source.size/1024/1024/2}));
  assert.equal(before.checks.find(item=>item.key==='file-size').state,'can-fix');
  assert.equal(before.checks.find(item=>item.key==='page-count').state,'pass');
  assert.equal(before.checks.find(item=>item.key==='page-size').state,'fail');
  assert.equal(before.checks.find(item=>item.key==='encryption').state,'pass');
  assert.equal(before.checks.find(item=>item.key==='active-actions').state,'can-fix');
  const plan=buildPreflightPlan(before);assert.ok(plan.canFix.includes('Maximum file size'));assert.ok(plan.needsDecision.includes('Required page size'));assert.ok(plan.needsDecision.includes('Metadata and XMP'));
  console.log('PASS: requirement comparison and feature-specific plan states');

  const activeOnly=await runApprovedPreflight(source,before,requirements({maximumSizeMb:undefined,requiredPageSize:'any'}),approval({removeActiveActions:true}),{inspect,sanitize:sanitizeWithRenderer});
  assert.equal(activeOnly.after.checks.find(item=>item.key==='active-actions').state,'pass');
  assert.ok(activeOnly.after.safety.find(item=>item.key==='metadata').count>0,'metadata was silently removed');
  assert.ok(activeOnly.after.safety.find(item=>item.key==='forms').count>0,'form disappeared');
  assert.ok(activeOnly.after.safety.find(item=>item.key==='external-links').count>0,'external link disappeared');
  const activePdf=await PDFDocument.load(await activeOnly.blob.arrayBuffer(),{updateMetadata:false});
  assert.equal(activePdf.getForm().getTextField(FIELD).getText(),VALUE);assert.equal(activePdf.getAuthor(),AUTHOR);
  console.log('PASS: BEFORE -> selected active-action fix -> actual AFTER; form, value, metadata, and external link preserved');

  const signedFile=await signedFixture(),signedBefore=await inspect(signedFile,requirements({requiredPageSize:'any'}));
  assert.equal(signedBefore.signed,true);
  let signedSanitizeCalls=0,signedCompressCalls=0;
  await assert.rejects(()=>runApprovedPreflight(signedFile,signedBefore,signedBefore.requirements,approval({removeActiveActions:true,removeMetadata:true,removeAttachments:true,removeExternalLinks:true,removeComments:true,tryStructureOptimization:true}),{
    inspect,sanitize:async()=>{signedSanitizeCalls++;throw new Error('must not sanitize')},compress:async()=>{signedCompressCalls++;throw new Error('must not compress')},
  }),/Digital signature structure detected/);
  assert.equal(signedSanitizeCalls,0);assert.equal(signedCompressCalls,0);
  console.log('PASS: detected signature blocks every rewrite before sanitization or compression');

  const compressionSource=await fixture({letter:true,name:'compression-target.pdf'}),tinyRules=requirements({requiredPageSize:'letter',disallowActiveActions:false,maximumSizeMb:.0001}),compressionBefore=await inspect(compressionSource,tinyRules);
  const compressed=await runApprovedPreflight(compressionSource,compressionBefore,tinyRules,approval({tryStructureOptimization:true}),{inspect});
  assert.ok(compressed.compression);assert.equal(compressed.after.checks.find(item=>item.key==='file-size').state,'can-fix');assert.equal(compressed.furtherCompressionNeedsDecision,true);
  console.log('PASS: structure optimization with savings but still above target stops for a manual decision');

  let inspectCalls=0;
  const countingInspect=async(file,rules)=>{inspectCalls++;return inspect(file,rules)};
  const noSavings=await runApprovedPreflight(compressionSource,compressionBefore,tinyRules,approval({tryStructureOptimization:true}),{
    inspect:countingInspect,
    compress:async({file})=>({blob:file.slice(),filename:'no-savings.pdf',size:file.size,pageCount:1,originalSize:file.size,savedBytes:0,savedPercentage:0,hasSavings:false,level:'light'}),
  });
  assert.equal(noSavings.changed,false);assert.equal(noSavings.compression.hasSavings,false);assert.equal(noSavings.furtherCompressionNeedsDecision,true);assert.equal(inspectCalls,2,'candidate and retained output were not both reinspected');
  console.log('PASS: no-savings candidate is reinspected, rejected, and reported honestly');

  const unavailable=await inspectPdfPreflight(compressionSource,tinyRules,{inspectPrivacy:async()=>{throw new Error('bounded privacy limit')}});
  assert.equal(unavailable.signed,null);assert.equal(unavailable.checks.find(item=>item.key==='active-actions').state,'not-checked');assert.equal(unavailable.checks.find(item=>item.key==='file-size').state,'needs-decision');assert.ok(unavailable.safety.every(item=>!item.checked&&item.summary.startsWith('Not checked')));
  const unavailablePlan=buildPreflightPlan(unavailable);assert.ok(!unavailablePlan.canFix.includes('Maximum file size'));assert.ok(unavailablePlan.needsDecision.includes('Maximum file size'));
  let unknownSanitizeCalls=0,unknownCompressCalls=0;
  await assert.rejects(()=>runApprovedPreflight(compressionSource,unavailable,tinyRules,approval({removeActiveActions:true,removeMetadata:true,removeAttachments:true,removeExternalLinks:true,removeComments:true,tryStructureOptimization:true}),{
    inspect,sanitize:async()=>{unknownSanitizeCalls++;throw new Error('must not sanitize')},compress:async()=>{unknownCompressCalls++;throw new Error('must not compress')},
  }),/Signature status was not checked/);
  assert.equal(unknownSanitizeCalls,0);assert.equal(unknownCompressCalls,0);
  console.log('PASS: unavailable safety/signature inspection stays unknown and blocks all rewrites, including oversized-file optimization');

  const orderedRules=requirements({requiredPageSize:'any',disallowActiveActions:false,maximumSizeMb:1}),orderedBefore=await inspect(compressionSource,orderedRules),observedOutputs=[];
  const orderedInspect=async(file,rules)=>{const value=await file.text();observedOutputs.push(value);return{...orderedBefore,filename:file.name,fileSize:file.size,requirements:rules,checks:orderedBefore.checks.map(check=>check.key==='file-size'?{...check,state:'pass',summary:'Mock final size passes.'}:check)}};
  const ordered=await runApprovedPreflight(compressionSource,orderedBefore,orderedRules,approval({removeMetadata:true,tryStructureOptimization:true}),{
    inspect:orderedInspect,
    sanitize:async()=>({blob:new Blob(['SANITIZED'],{type:'application/pdf'}),filename:'sanitized.pdf',steps:[{key:'metadata',title:'Metadata & XMP',status:'verified-removed',beforeCount:1,afterCount:0,warnings:[]}]}),
    compress:async({file})=>{assert.equal(await file.text(),'SANITIZED','compression did not receive latest sanitized File');return{blob:new Blob(['ZIP'],{type:'application/pdf'}),filename:'compressed.pdf',size:3,pageCount:1,originalSize:file.size,savedBytes:file.size-3,savedPercentage:(file.size-3)/file.size*100,hasSavings:true,level:'light'}},
  });
  assert.deepEqual(observedOutputs,['ZIP','ZIP'],'candidate/final inspections did not use actual final output');assert.equal(await ordered.blob.text(),'ZIP');assert.equal(ordered.after.fileSize,3);
  console.log('PASS: safety gate precedes transforms; sanitization feeds compression; candidate and final After use the latest in-memory output');

  const component=fs.readFileSync(path.resolve('components/pdf-preflight.tsx'),'utf8'),route=fs.readFileSync(path.resolve('app/tools/pdf-preflight/page.tsx'),'utf8'),site=fs.readFileSync(path.resolve('lib/site.ts'),'utf8');
  for(const phrase of ['Requirements','Before inspection','Safety review','Approve changes and create copy','After verification','Further compression would require a more destructive method'])assert.ok(component.includes(phrase),'missing workflow copy: '+phrase);
  assert.ok(component.includes('Digital signature structure detected'));assert.ok(component.includes('Rewrite safety could not be checked, so ToolNest will not modify this PDF automatically.'));
  assert.ok(component.includes('inspection.signed === false'));assert.ok(!component.includes('Portal approved'));assert.ok(route.includes('alternates: { canonical: "/tools/pdf-preflight" }'));assert.ok(site.includes('href: "/tools/pdf-preflight"'));
  console.log('PASS: route, registry, canonical, narrow workflow copy, and prohibited-claim controls');
})().catch(error=>{console.error(error);process.exitCode=1});
