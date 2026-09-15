require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const canvas = require('@napi-rs/canvas');
const tesseract = require('tesseract.js');
const { PDFDocument, StandardFonts, degrees, rgb } = require('pdf-lib');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) { return originalResolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args); };
globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
Promise.try ??= (callback,...args)=>Promise.resolve().then(()=>callback(...args));
globalThis.document={createElement(name){assert.equal(name,'canvas');const value=canvas.createCanvas(1,1);value.toBlob=(callback,type='image/png')=>callback(new Blob([value.toBuffer(type)],{type}));return value;}};
const {renderPageToCanvasForOcr,rotateCanvas}=require('../lib/pdf/ocr-render.ts');
const {recognitionLines,buildOcrWordPage}=require('../lib/pdf/ocr-word-layout.ts');
const searchable=require('../lib/pdf/searchable.ts');
const output=path.resolve('work/searchable-pdf-qa');fs.mkdirSync(output,{recursive:true});

function scanImage(label, lines, rotate=0){
  const base=canvas.createCanvas(1100,760),context=base.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,1100,760);context.fillStyle='#111';context.font='bold 48px Arial';context.fillText(label,70,100);context.font='34px Arial';lines.forEach((text,index)=>context.fillText(text,70,190+index*75));
  if(!rotate)return base;const rotated=canvas.createCanvas(base.height,base.width),rc=rotated.getContext('2d');rc.translate(rotated.width/2,rotated.height/2);rc.rotate(rotate*Math.PI/180);rc.drawImage(base,-base.width/2,-base.height/2);return rotated;
}
async function scannedPdf(images){const pdf=await PDFDocument.create();for(const image of images){const png=await pdf.embedPng(image.toBuffer('image/png')),page=pdf.addPage([550,380]);page.drawImage(png,{x:0,y:0,width:550,height:380});}return pdf.save();}
async function nativePdf(){const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);for(let i=0;i<2;i++){const page=pdf.addPage([550,380]);page.drawRectangle({x:35,y:40,width:480,height:285,borderColor:rgb(.1,.35,.7),borderWidth:2});page.drawText(`NATIVE SEARCHABLE PAGE ${i+1}`,{x:65,y:260,size:24,font});page.drawText('This selectable vector text must remain intact.',{x:65,y:205,size:15,font});if(i===1)page.setRotation(degrees(90));}return pdf.save();}
async function mixedPdf(nativeBytes,scan){const native=await PDFDocument.load(nativeBytes),pdf=await PDFDocument.create();const [copy]=await pdf.copyPages(native,[0]);pdf.addPage(copy);const png=await pdf.embedPng(scan.toBuffer('image/png')),page=pdf.addPage([550,380]);page.drawImage(png,{x:0,y:0,width:550,height:380});return pdf.save();}

async function openPdf(pdfjs,bytes){return pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false}).promise;}
async function recognizePage(worker,page,candidates=[0]){
  const viewport=page.getViewport({scale:1}),source=await renderPageToCanvasForOcr(page,2),created=[];let best;
  try{
    for(const rotation of candidates){const image=rotation?rotateCanvas(source,rotation):source;if(rotation)created.push(image);const {data}=await worker.recognize(image.toBuffer('image/png'),{}, {blocks:true,text:true});const words=(data.text.match(/[A-Za-z]{3,}/g)||[]).length;if(!best||words>best.words)best={rotation,image,data,words};}
    const swap=best.rotation===90||best.rotation===270,wordPage=buildOcrWordPage(recognitionLines(best.data),best.image.width,best.image.height,swap?viewport.height:viewport.width,swap?viewport.width:viewport.height);
    return searchable.searchablePlacements(wordPage,best.rotation,viewport);
  }finally{created.forEach(item=>{item.width=0;item.height=0;});source.width=0;source.height=0;}
}
async function makeOutput(pdfjs,worker,bytes,rotationCandidates={}){
  const doc=await openPdf(pdfjs,bytes),layers=new Map(),preserved=[];
  try{for(let number=1;number<=doc.numPages;number++){const page=await doc.getPage(number);try{const text=await page.getTextContent();if(searchable.hasUsablePdfText(text)){preserved.push(number);continue;}const placements=await recognizePage(worker,page,rotationCandidates[number]||[0]);layers.set(number,placements);}finally{page.cleanup();}}}finally{await doc.destroy();}
  return {bytes:layers.size?await searchable.addSearchableTextLayers(new Uint8Array(bytes),layers):new Uint8Array(bytes),layers,preserved};
}
async function pageText(pdfjs,bytes){const doc=await openPdf(pdfjs,bytes),texts=[];try{for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);try{texts.push((await page.getTextContent()).items.map(item=>item.str).join(' '));}finally{page.cleanup();}}return texts;}finally{await doc.destroy();}}
async function renderPixels(pdfjs,bytes,pageNumber){const doc=await openPdf(pdfjs,bytes);try{const page=await doc.getPage(pageNumber),viewport=page.getViewport({scale:1.4}),surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=surface.getContext('2d');await page.render({canvas:surface,canvasContext:context,viewport,background:'rgb(255,255,255)'}).promise;page.cleanup();return context.getImageData(0,0,surface.width,surface.height).data;}finally{await doc.destroy();}}
function meanPixelDifference(a,b){assert.equal(a.length,b.length);let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);return total/a.length;}

(async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const first=scanImage('SCANNED REPORT',['Alpha project summary','Reference number 4827','Search every recognized sentence.']);
  const second=scanImage('SECOND SCANNED PAGE',['Quarterly document archive','The original image stays visible','English OCR quality check.']);
  const mixedScan=scanImage('MIXED SCAN PAGE',['Native page one stays untouched','Only this page receives OCR','Local browser processing.']);
  const rotatedScan=scanImage('ROTATED SCAN',['Orientation must be corrected','Searchable text follows the page','Visual pixels stay unchanged.'],90);
  const sources={scanned:await scannedPdf([first,second]),native:await nativePdf(),mixed:null,rotated:await scannedPdf([rotatedScan])};sources.mixed=await mixedPdf(sources.native,mixedScan);
  Object.entries(sources).forEach(([name,bytes])=>fs.writeFileSync(path.join(output,`${name}-source.pdf`),bytes));
  const worker=await tesseract.createWorker('eng',1,{cachePath:path.resolve('work/image-ocr-qa')});
  try{
    const scanned=await makeOutput(pdfjs,worker,sources.scanned),native=await makeOutput(pdfjs,worker,sources.native),mixed=await makeOutput(pdfjs,worker,sources.mixed),rotated=await makeOutput(pdfjs,worker,sources.rotated,{1:[0,270]});
    const results={scanned,native,mixed,rotated};for(const [name,result] of Object.entries(results))fs.writeFileSync(path.join(output,`${name}-searchable.pdf`),result.bytes);
    assert.equal(scanned.layers.size,2);assert.deepEqual(native.preserved,[1,2]);assert.equal(native.layers.size,0);assert.deepEqual(native.bytes,new Uint8Array(sources.native));assert.deepEqual(mixed.preserved,[1]);assert.equal(mixed.layers.size,1);assert.equal(rotated.layers.size,1);
    assert.ok(Math.abs([...scanned.layers.values()][0][0].angle)<1);assert.ok(Math.abs(Math.abs([...rotated.layers.values()][0][0].angle)-90)<1);
    const scannedText=await pageText(pdfjs,scanned.bytes),mixedText=await pageText(pdfjs,mixed.bytes),rotatedText=await pageText(pdfjs,rotated.bytes);
    assert.match(scannedText[0],/SCANNED REPORT/i);assert.match(scannedText[1],/SECOND SCANNED PAGE/i);assert.match(mixedText[0],/NATIVE SEARCHABLE PAGE 1/i);assert.match(mixedText[1],/MIXED SCAN PAGE/i);assert.match(rotatedText[0],/ROTATED SCAN/i);
    const sourcePixels=await renderPixels(pdfjs,sources.scanned,1),outputPixels=await renderPixels(pdfjs,scanned.bytes,1);assert.ok(meanPixelDifference(sourcePixels,outputPixels)<.01,'Invisible layer changed visible pixels');
    const sourceRotatedPixels=await renderPixels(pdfjs,sources.rotated,1),outputRotatedPixels=await renderPixels(pdfjs,rotated.bytes,1);assert.ok(meanPixelDifference(sourceRotatedPixels,outputRotatedPixels)<.01,'Rotated output changed visible pixels');
    for(const name of Object.keys(results)){const originalDoc=await PDFDocument.load(sources[name]),outputDoc=await PDFDocument.load(results[name].bytes);assert.deepEqual(outputDoc.getPages().map(page=>[page.getWidth(),page.getHeight(),page.getRotation().angle]),originalDoc.getPages().map(page=>[page.getWidth(),page.getHeight(),page.getRotation().angle]));}
    console.log('PASS: fully scanned multi-page, native preservation/no OCR, mixed PDF, rotated scan, searchable text, dimensions/rotation, and pixel-identical visible output.');
    console.log(JSON.stringify({output,scannedText,mixedText,rotatedText,meanPixelDifference:meanPixelDifference(sourcePixels,outputPixels)}));
  }finally{await worker.terminate();}
})().catch(error=>{console.error(error);process.exitCode=1;});
