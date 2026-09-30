require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict');
const Module=require('node:module'),path=require('node:path'),canvas=require('@napi-rs/canvas');
const {PDFArray,PDFDict,PDFDocument,PDFName,PDFRef,PDFString,StandardFonts,degrees,rgb}=require('pdf-lib');
const {pathToFileURL}=require('node:url');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
Promise.try??=(callback,...args)=>Promise.resolve().then(()=>callback(...args));
const {compressPdfFile}=require('../lib/pdf/compress.ts');
const {inspectPdfPrivacy}=require('../lib/pdf/privacy-inspect.ts');
const N=value=>PDFName.of(value);
const FIELD_NAME='ApprovalCode',FIELD_VALUE='PREFLIGHT-FORM-042',AUTHOR='Transparent Preflight Author';
const EXTERNAL_URI='https://example.test/preflight-preserved',COMMENT='Ordinary review comment';
const PAGE_TEXT=['PREFLIGHT PAGE ONE SEARCHABLE','PREFLIGHT PAGE TWO ROTATED SEARCHABLE'];

function resolveDict(pdf,value){const resolved=value instanceof PDFRef?pdf.context.lookup(value):value;return resolved instanceof PDFDict?resolved:undefined}
function addAnnotation(pdf,page,values){const annotation=pdf.context.register(pdf.context.obj({Type:'Annot',Rect:[35,35,220,62],...values}));page.node.addAnnot(annotation)}
async function makeFixture(){
  const pdf=await PDFDocument.create({updateMetadata:false}),page1=pdf.addPage([500,350]),page2=pdf.addPage([420,600]),font=await pdf.embedFont(StandardFonts.Helvetica);
  page2.setRotation(degrees(90));
  page1.drawText(PAGE_TEXT[0],{x:40,y:292,size:18,font});page2.drawText(PAGE_TEXT[1],{x:45,y:535,size:16,font});
  for(let row=0;row<16;row++){page1.drawText(`Lossless structure control row ${row+1}`,{x:42,y:255-row*12,size:8,font});page2.drawText(`Second page control row ${row+1}`,{x:46,y:495-row*15,size:9,font})}
  page1.drawRectangle({x:30,y:25,width:440,height:300,borderColor:rgb(.2,.3,.7),borderWidth:1});
  const field=pdf.getForm().createTextField(FIELD_NAME);field.setText(FIELD_VALUE);field.addToPage(page1,{x:270,y:45,width:180,height:28,font});
  pdf.setAuthor(AUTHOR);
  pdf.addJavaScript('PreflightFixture','app.alert("structure optimization control")');
  addAnnotation(pdf,page1,{Subtype:'Link',A:{Type:'Action',S:'URI',URI:PDFString.of(EXTERNAL_URI)}});
  addAnnotation(pdf,page2,{Subtype:'Link',A:{Type:'Action',S:'GoTo',D:[page1.ref,N('Fit')]}});
  addAnnotation(pdf,page1,{Subtype:'Text',Rect:[235,35,258,58],Contents:PDFString.of(COMMENT),T:PDFString.of('Reviewer')});
  await pdf.attach(new Uint8Array([84,79,79,76,78,69,83,84]),'preflight-note.txt',{mimeType:'text/plain',description:'Structure optimization attachment'});
  const bytes=new Uint8Array(await pdf.save({useObjectStreams:false,updateFieldAppearances:false}));
  return new File([bytes],'transparent-preflight-compression.pdf',{type:'application/pdf'});
}
async function makeSignatureFixture(){
  const pdf=await PDFDocument.create({updateMetadata:false});pdf.addPage([320,220]);
  const signature=pdf.context.register(pdf.context.obj({Type:'Sig',Filter:'Adobe.PPKLite',SubFilter:'adbe.pkcs7.detached',ByteRange:[0,0,0,0],Contents:PDFString.of('SYNTHETIC-NOT-CRYPTOGRAPHICALLY-VALID')}));
  pdf.catalog.set(N('SignatureFixture'),signature);
  const bytes=new Uint8Array(await pdf.save({useObjectStreams:false}));
  return new File([bytes],'synthetic-signature-structure.pdf',{type:'application/pdf'});
}
function annotations(pdf){
  const result={externalUri:undefined,goToPage:undefined,goToFit:false,comment:undefined};
  const pages=pdf.getPages();
  for(const page of pages){const list=page.node.Annots();if(!list)continue;for(let index=0;index<list.size();index++){
    const annotation=resolveDict(pdf,list.get(index));if(!annotation)continue;
    if(annotation.lookup(N('Subtype'))?.asString()==='/Text')result.comment=annotation.lookup(N('Contents'))?.decodeText();
    const action=resolveDict(pdf,annotation.get(N('A'))),kind=action?.lookup(N('S'))?.asString();
    if(kind==='/URI')result.externalUri=action.lookup(N('URI'))?.decodeText();
    if(kind==='/GoTo'){const destination=action.lookup(N('D'));if(destination instanceof PDFArray&&destination.size()>=2){const target=destination.get(0);result.goToPage=target instanceof PDFRef?pages.findIndex(candidate=>candidate.ref.toString()===target.toString())+1:undefined;result.goToFit=destination.get(1)?.asString?.()==='/Fit'}}
  }}
  return result;
}
async function structuralSnapshot(file){
  const pdf=await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false}),fields=pdf.getForm().getFields(),annots=annotations(pdf);
  return{pageCount:pdf.getPageCount(),dimensions:pdf.getPages().map(page=>[page.getWidth(),page.getHeight()]),rotations:pdf.getPages().map(page=>page.getRotation().angle),formCount:fields.length,formValue:pdf.getForm().getTextField(FIELD_NAME).getText(),author:pdf.getAuthor(),...annots};
}
async function rendererSnapshot(pdfjs,blob){
  const document=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
  try{const pages=[];for(let number=1;number<=document.numPages;number++){const page=await document.getPage(number),viewport=page.getViewport({scale:1.25}),surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=surface.getContext('2d');context.fillStyle='white';context.fillRect(0,0,surface.width,surface.height);await page.render({canvas:surface,canvasContext:context,viewport,background:'rgb(255,255,255)'}).promise;const text=await page.getTextContent();pages.push({width:surface.width,height:surface.height,text:text.items.map(item=>item.str).join(' '),pixels:context.getImageData(0,0,surface.width,surface.height).data})}return pages}finally{await document.loadingTask.destroy()}
}
function pixelDifference(before,after){assert.equal(before.length,after.length);let total=0;for(let index=0;index<before.length;index++)total+=Math.abs(before[index]-after[index]);return total/before.length}
function privacyCounts(inspection){const count=category=>inspection.findings.filter(finding=>finding.category===category).length;return{metadata:count('metadata')+count('xmp'),activeContent:count('active-content'),externalLinks:count('external-link'),forms:count('form'),attachments:count('attachment'),comments:inspection.findings.filter(finding=>finding.category==='annotation'&&finding.evidence?.subtype==='Text').length,signed:inspection.signed}}

(async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const openRenderer=async file=>pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
  const source=await makeFixture(),sourceBytes=new Uint8Array(await source.arrayBuffer()),beforeStructure=await structuralSnapshot(source),beforePrivacy=await inspectPdfPrivacy(source,openRenderer),beforeRender=await rendererSnapshot(pdfjs,source),beforeCounts=privacyCounts(beforePrivacy);
  assert.deepEqual(beforeStructure.dimensions,[[500,350],[420,600]]);assert.deepEqual(beforeStructure.rotations,[0,90]);assert.equal(beforeStructure.formValue,FIELD_VALUE);assert.equal(beforeStructure.externalUri,EXTERNAL_URI);assert.equal(beforeStructure.goToPage,1);assert.equal(beforeStructure.goToFit,true);assert.equal(beforeStructure.comment,COMMENT);
  assert.ok(beforeCounts.metadata>0);assert.ok(beforeCounts.activeContent>0);assert.ok(beforeCounts.externalLinks>0);assert.ok(beforeCounts.forms>0);assert.ok(beforeCounts.attachments>0);assert.ok(beforeCounts.comments>0);
  for(let index=0;index<PAGE_TEXT.length;index++)assert.ok(beforeRender[index].text.includes(PAGE_TEXT[index]),`page ${index+1} searchable text missing before compression`);
  const compressed=await compressPdfFile({file:source,level:'light'});
  assert.equal(compressed.level,'light');assert.equal(compressed.pageCount,2);assert.equal(compressed.originalSize,source.size);assert.equal(compressed.size,compressed.blob.size);assert.equal(compressed.savedBytes,Math.max(0,source.size-compressed.blob.size));assert.equal(compressed.hasSavings,compressed.blob.size<source.size);assert.equal(compressed.savedPercentage,compressed.hasSavings?compressed.savedBytes/source.size*100:0);
  assert.deepEqual(new Uint8Array(await source.arrayBuffer()),sourceBytes,'source File changed');
  const outputFile=new File([compressed.blob],compressed.filename,{type:'application/pdf'}),afterStructure=await structuralSnapshot(outputFile),afterPrivacy=await inspectPdfPrivacy(outputFile,openRenderer),afterRender=await rendererSnapshot(pdfjs,compressed.blob),afterCounts=privacyCounts(afterPrivacy);
  assert.deepEqual(afterStructure,beforeStructure,'structural semantics changed');assert.deepEqual(afterCounts,beforeCounts,'privacy-visible structures changed');
  const differences=[];for(let index=0;index<beforeRender.length;index++){assert.equal(afterRender[index].width,beforeRender[index].width);assert.equal(afterRender[index].height,beforeRender[index].height);assert.equal(afterRender[index].text,beforeRender[index].text);const difference=pixelDifference(beforeRender[index].pixels,afterRender[index].pixels);differences.push(difference);assert.ok(difference<.01,`page ${index+1} visible pixels changed: ${difference}`)}
  const signatureFile=await makeSignatureFixture(),signatureInspection=await inspectPdfPrivacy(signatureFile,openRenderer);
  assert.equal(signatureInspection.signed,true,'signature structure was not detected');
  console.log('BEFORE',JSON.stringify({bytes:source.size,structure:beforeStructure,privacy:beforeCounts}));
  console.log('AFTER',JSON.stringify({bytes:compressed.blob.size,structure:afterStructure,privacy:afterCounts}));
  console.log('SIZE',JSON.stringify({inputBytes:source.size,outputBytes:compressed.blob.size,savedBytes:compressed.savedBytes,savedPercentage:Number(compressed.savedPercentage.toFixed(4)),hasSavings:compressed.hasSavings}));
  console.log('PIXELS',JSON.stringify(differences.map((difference,index)=>({page:index+1,meanAbsoluteChannelDifference:Number(difference.toFixed(6))}))));
  console.log('SIGNED',JSON.stringify({detected:signatureInspection.signed,cryptographicValidityClaimed:false,compressionAttempted:false}));
  console.log('PASS: light compression preserved all tested semantic and visible structures in memory');
})().catch(error=>{console.error(error);process.exitCode=1});
